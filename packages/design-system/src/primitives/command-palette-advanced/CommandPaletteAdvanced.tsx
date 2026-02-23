import { useMemo, useState } from 'react';
import { Command } from 'cmdk';

type CommandEntry = {
  id: string;
  label: string;
  hint?: string;
};

type CommandPaletteAdvancedProps = {
  entries: CommandEntry[];
  onSelect: (entry: CommandEntry) => void;
};

export function CommandPaletteAdvanced({
  entries,
  onSelect,
}: CommandPaletteAdvancedProps) {
  const [query, setQuery] = useState('');

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter(entry =>
      entry.label.toLowerCase().includes(normalized),
    );
  }, [entries, query]);

  return (
    <Command label="Advanced Command Palette" shouldFilter={false}>
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search commands"
      />
      <Command.List>
        <Command.Empty>No command found.</Command.Empty>
        <Command.Group heading="Commands">
          {filteredEntries.map(entry => (
            <Command.Item
              key={entry.id}
              value={entry.label}
              onSelect={() => onSelect(entry)}
            >
              <span>{entry.label}</span>
              {entry.hint ? (
                <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{entry.hint}</span>
              ) : null}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
