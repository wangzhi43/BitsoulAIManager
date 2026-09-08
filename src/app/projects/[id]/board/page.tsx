import { redirect } from "next/navigation";

// 项目看板（TECH_DESIGN §4.3 /projects/[id]/board）：执行看板按项目筛选即项目看板
export default async function ProjectBoardRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/pools?project=${encodeURIComponent(id)}`);
}
