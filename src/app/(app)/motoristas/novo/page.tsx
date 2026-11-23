import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/common";
import { DriverForm } from "../driver-form";

export default async function NovoMotorista() {
  await requireAdmin();
  return (<><PageHeader title="Novo motorista" /><DriverForm /></>);
}
