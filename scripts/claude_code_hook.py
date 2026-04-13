"""
Claude Code Stop Hook - Token Tracker
Le o transcript JSONL apos cada resposta e envia CADA chamada API individualmente.
"""
import sys
import json
import os
from urllib.request import urlopen, Request
from datetime import datetime, timezone

# =============================================
# URL DO SERVIDOR LOCAL
# (ou defina as env vars TOKEN_TRACKER_WEBHOOK e TOKEN_TRACKER_TOKEN)
# =============================================
WEBHOOK_URL = os.environ.get(
    'TOKEN_TRACKER_WEBHOOK',
    'http://localhost:3002/api/webhook/track-tokens'
)
WEBHOOK_TOKEN = os.environ.get(
    'TOKEN_TRACKER_TOKEN',
    'seu-webhook-token-aqui'
)
# =============================================

LOG_DIR = os.path.dirname(os.path.abspath(__file__))
SENT_FILE = os.path.join(LOG_DIR, '.last_sent_line.json')


def get_last_sent_line(session_id):
    """Retorna a ultima linha ja enviada para esta sessao."""
    if not os.path.exists(SENT_FILE):
        return 0
    try:
        with open(SENT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get(session_id, 0)
    except Exception:
        return 0


def save_last_sent_line(session_id, line_num):
    """Salva a ultima linha enviada para esta sessao."""
    data = {}
    if os.path.exists(SENT_FILE):
        try:
            with open(SENT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            data = {}
    data[session_id] = line_num
    with open(SENT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f)


def extract_auto_name(transcript_path):
    """Extrai o nome automatico da sessao a partir da primeira mensagem do usuario."""
    if not transcript_path or not os.path.exists(transcript_path):
        return None
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict):
                    continue

                # Formato: {"type": "human", "message": {"role": "user", "content": ...}}
                msg = entry.get('message', {})
                role = msg.get('role') or entry.get('role', '')
                if role != 'user':
                    continue

                content = msg.get('content') or entry.get('content', '')

                # content pode ser string ou lista de blocos
                text = ''
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get('type') == 'text':
                            text = block.get('text', '')
                            break
                        elif isinstance(block, str):
                            text = block
                            break

                text = text.strip()
                if text:
                    # Trunca em 80 chars, sem quebrar palavra
                    if len(text) > 80:
                        text = text[:77].rsplit(' ', 1)[0] + '...'
                    # Remove quebras de linha
                    text = ' '.join(text.split())
                    return text if text else None
    except Exception:
        pass
    return None


def extract_usage_entries(transcript_path, skip_lines=0):
    """Le o JSONL e retorna TODAS as chamadas API individuais das linhas novas."""
    if not transcript_path or not os.path.exists(transcript_path):
        return [], 0

    entries = []
    model = None
    line_count = 0

    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
            line_count += 1
            if line_count <= skip_lines:
                continue

            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not isinstance(entry, dict):
                continue

            # Extrai model
            for key in ['model', 'activeModel']:
                if key in entry and entry[key]:
                    model = entry[key]

            # Tenta extrair usage de message.usage (formato principal)
            usage = None
            msg = {}

            if 'message' in entry and isinstance(entry.get('message'), dict):
                msg = entry['message']
                if 'usage' in msg:
                    usage = msg['usage']
                if 'model' in msg:
                    model = msg['model']
            elif 'usage' in entry:
                usage = entry['usage']

            # Formato camelCase (fallback)
            if 'inputTokens' in entry:
                usage = {
                    'input_tokens': entry.get('inputTokens', 0),
                    'output_tokens': entry.get('outputTokens', 0),
                    'cache_read_input_tokens': entry.get('cacheReadInputTokens', 0),
                    'cache_creation_input_tokens': entry.get('cacheCreationInputTokens', 0),
                }

            # DEDUP: só conta entries com stop_reason (resultado final da API call).
            # Streaming chunks intermediários têm stop_reason=None e usage idêntico.
            stop_reason = msg.get('stop_reason') or entry.get('stop_reason')
            if usage and not stop_reason:
                continue

            if usage and isinstance(usage, dict):
                inp = usage.get('input_tokens', 0) or 0
                out = usage.get('output_tokens', 0) or 0
                cr = usage.get('cache_read_input_tokens', 0) or 0
                cw = usage.get('cache_creation_input_tokens', 0) or 0
                if inp > 0 or out > 0:
                    entries.append({
                        'model': model,
                        'input_tokens': inp,
                        'output_tokens': out,
                        'cache_read_tokens': cr,
                        'cache_write_tokens': cw,
                    })

    return entries, line_count


def send_to_webhook(data):
    """Envia dados para o servidor local via webhook."""
    try:
        payload = json.dumps(data).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        if WEBHOOK_TOKEN:
            headers['X-Webhook-Token'] = WEBHOOK_TOKEN
        req = Request(
            WEBHOOK_URL,
            data=payload,
            headers=headers,
            method='POST'
        )
        with urlopen(req, timeout=10):
            pass
    except Exception as e:
        log_path = os.path.join(LOG_DIR, 'token_log.jsonl')
        with open(log_path, 'a', encoding='utf-8') as f:
            data['_error'] = str(e)
            f.write(json.dumps(data) + '\n')


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)

    session_id = hook_input.get('session_id', '')
    transcript_path = hook_input.get('transcript_path', '')

    skip_lines = get_last_sent_line(session_id)
    entries, total_lines = extract_usage_entries(transcript_path, skip_lines)

    # Extrai nome automatico apenas na primeira vez (skip_lines == 0)
    auto_name = None
    if skip_lines == 0:
        auto_name = extract_auto_name(transcript_path)

    now = datetime.now(timezone.utc).isoformat()

    for entry in entries:
        payload = {
            'timestamp': now,
            'source': 'claude-code',
            'model': entry.get('model') or 'unknown',
            'input_tokens': entry['input_tokens'],
            'output_tokens': entry['output_tokens'],
            'cache_read_tokens': entry.get('cache_read_tokens', 0),
            'cache_write_tokens': entry.get('cache_write_tokens', 0),
            'session_id': session_id,
            'conversation_url': ''
        }
        if auto_name:
            payload['auto_name'] = auto_name
        send_to_webhook(payload)

    save_last_sent_line(session_id, total_lines)


if __name__ == '__main__':
    main()
