import { SelfManagement } from "@/components/self-management";
export const metadata = {
  title: "管理我的預約 | BookFlow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <SelfManagement />;
}
