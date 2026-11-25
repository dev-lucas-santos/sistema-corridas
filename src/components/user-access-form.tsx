import { ActionForm } from "@/components/action-form";
import { updateUser } from "@/app/actions/users";

export function UserAccessForm({ id, role, active }: { id: string; role: string; active: boolean }) {
  return (
    <ActionForm action={updateUser} submitLabel={active ? "Desativar" : "Aprovar acesso"} buttonClassName={active ? "btn-danger" : "btn-primary"} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <select name="role" defaultValue={role} className="input !w-auto" aria-label="Papel do usuário">
        <option value="operator">Operador</option>
        <option value="admin">Admin</option>
      </select>
    </ActionForm>
  );
}
