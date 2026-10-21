import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "BookFlow｜預約，從容有序", template: "%s · BookFlow" },
  description: "讓服務、人員與預約自然串連的店家管理平台",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
