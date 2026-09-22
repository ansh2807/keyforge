import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { ApplicationTabs } from "@/components/application-tabs";

export function ApplicationHeading({
  application,
}: {
  application: { id: string; name: string; publicId: string; status: string };
}) {
  const badgeClass = application.status === "ACTIVE" ? "good" : application.status === "PAUSED" ? "warn" : "bad";
  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="helper" href="/dashboard/apps"><ArrowLeft size={14} /> Applications</Link>
          <h1>{application.name}</h1>
          <p className="mono">{application.publicId}</p>
        </div>
        <span className={`badge ${badgeClass}`}>{application.status}</span>
      </div>
      <ApplicationTabs applicationId={application.id} />
    </>
  );
}
