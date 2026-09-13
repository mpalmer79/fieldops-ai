import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ControlRoomShell } from "@/app/control-room/_components/control-room-shell";
import { getWorkspaceRoute, workspaceRoutes } from "@/app/control-room/workspace-routes";

type WorkspacePageProps = {
  params: Promise<{ workspace: string }>;
};

export function generateStaticParams() {
  return workspaceRoutes.map(({ slug }) => ({ workspace: slug }));
}

export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const { workspace } = await params;
  const route = getWorkspaceRoute(workspace);

  if (!route) {
    return {};
  }

  return {
    title: `${route.label} | FieldOps AI`,
  };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspace } = await params;
  const route = getWorkspaceRoute(workspace);

  if (!route) {
    notFound();
  }

  return <ControlRoomShell workspace={route} />;
}
