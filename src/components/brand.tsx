import { Keyhole } from "@phosphor-icons/react/dist/ssr";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Keyhole size={19} weight="bold" />
      </span>
      {!compact && <span>Keyforge</span>}
    </span>
  );
}
