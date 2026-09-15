/** Rendu simple du contrat (titres, gras, listes) — pas de HTML injecté. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ContractMarkdown({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="pt-2 text-base font-semibold text-foreground">
              {line.slice(2)}
            </h2>
          );
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="pt-3 text-sm font-semibold text-foreground">
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="pl-4">
              • {inline(line.slice(2))}
            </p>
          );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}
