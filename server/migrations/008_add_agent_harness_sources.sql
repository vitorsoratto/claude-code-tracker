ALTER TABLE token_entries DROP CONSTRAINT IF EXISTS token_entries_source_check;
ALTER TABLE token_entries ADD CONSTRAINT token_entries_source_check
  CHECK (source = ANY (ARRAY[
    'claude-code'::text,
    'claude.ai'::text,
    'opencode'::text,
    'codex'::text,
    'pi'::text,
    'droid'::text
  ]));
