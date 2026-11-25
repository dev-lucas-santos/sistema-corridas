import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DriverDemo } from "./preview";

export default async function DemoMotorista() {
  const host = (await headers()).get("host")?.split(":")[0];
  if (process.env.NODE_ENV === "production" || !host || !["localhost", "127.0.0.1"].includes(host)) notFound();
  return <DriverDemo />;
}
