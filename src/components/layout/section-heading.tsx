type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
      <div className="space-y-2">
        <h2 className="text-balance text-3xl leading-tight text-primary sm:text-4xl">{title}</h2>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

