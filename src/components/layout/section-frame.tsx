import { cn } from "@/lib/utils";

export function SectionFrame({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("relative", className)} {...props} />;
}

