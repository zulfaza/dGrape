import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import { useRef, useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { WorkspaceRole } from "../../convex/lib/workspaceRoles"
import { ConfirmButton, ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { ROLE_LABELS } from "@/components/workspace-role"
import { LoadingRows } from "@/components/loading-rows"

const ROLES = ["owner", "editor", "viewer"] as const
const INVITE_ROLES = ["editor", "viewer"] as const
type InviteRole = (typeof INVITE_ROLES)[number]

function parseRole(value: string): WorkspaceRole | null {
  return ROLES.find((role) => role === value) ?? null
}

function parseInviteRole(value: string): InviteRole | null {
  return INVITE_ROLES.find((role) => role === value) ?? null
}

/** Members, their roles, and invites. For owners only. */
export function WorkspaceMembers({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <MemberList workspaceId={workspaceId} />
      <Invites workspaceId={workspaceId} />
    </div>
  )
}

function MemberList({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.members.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const setRole = useMutation(api.members.setRole)
  const remove = useMutation(api.members.remove)
  const [saving, setSaving] = useState(false)
  const [roleChange, setRoleChange] = useState<{
    userId: string
    name: string
    role: WorkspaceRole
  } | null>(null)
  // The server also refuses to leave a workspace without an owner; this
  // only hides the controls that would fail.
  const soleOwner = useQuery(api.members.hasSoleOwner, { workspaceId })
  // Each row's role trigger, so focus returns to it after the confirmation.
  const roleTriggers = useRef(new Map<string, HTMLButtonElement>())

  async function run(action: () => Promise<null>, done: string) {
    setSaving(true)
    try {
      await action()
      toast.success(done)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.includes("at least one owner")
          ? "A workspace needs at least one owner"
          : "Could not change the member"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="members-heading" className="text-base font-semibold">
          Members
        </h2>
        <p className="text-sm text-muted-foreground">
          Viewers read. Editors also edit data and run jobs. Owners also manage
          access.
        </p>
      </div>
      {status === "LoadingFirstPage" ? (
        <LoadingRows label="Loading members" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((member) => {
            const name = member.email ?? (member.isYou ? "You" : "A member")
            const lastOwner = member.role === "owner" && soleOwner === true
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  title={name}
                >
                  {name}
                  {member.isYou && member.email && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (you)
                    </span>
                  )}
                </span>
                {lastOwner ? (
                  <span className="text-sm text-muted-foreground">
                    Owner · the only owner
                  </span>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Select
                      value={member.role}
                      disabled={saving}
                      onValueChange={(value) => {
                        const role = parseRole(value)
                        // Open after the Select has closed and released focus.
                        if (role && role !== member.role)
                          window.setTimeout(() =>
                            setRoleChange({ userId: member.userId, name, role })
                          )
                      }}
                    >
                      <SelectTrigger
                        ref={(element) => {
                          if (element)
                            roleTriggers.current.set(member.userId, element)
                          else roleTriggers.current.delete(member.userId)
                        }}
                        size="sm"
                        className="w-28"
                        aria-label={`Role of ${name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      title={
                        member.isYou
                          ? "Leave this workspace?"
                          : `Remove ${name}?`
                      }
                      description={
                        member.isYou
                          ? "You lose access at once. An owner must invite you again."
                          : "They lose access at once. You can invite them again."
                      }
                      confirmLabel={member.isYou ? "Leave" : "Remove"}
                      destructive
                      onConfirm={() =>
                        void run(
                          () => remove({ workspaceId, userId: member.userId }),
                          member.isYou
                            ? "You left the workspace"
                            : "Member removed"
                        )
                      }
                    >
                      {member.isYou ? "Leave" : "Remove"}
                    </ConfirmButton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}
      <ConfirmDialog
        open={roleChange !== null}
        onOpenChange={(open) => {
          if (!open) setRoleChange(null)
        }}
        title={
          roleChange
            ? `Make ${roleChange.name} ${ROLE_LABELS[roleChange.role].toLowerCase()}?`
            : ""
        }
        description="The new role applies at once."
        returnFocusTo={
          roleChange ? roleTriggers.current.get(roleChange.userId) : null
        }
        confirmLabel="Change role"
        onConfirm={() => {
          if (!roleChange) return
          const { userId, role } = roleChange
          void run(() => setRole({ workspaceId, userId, role }), "Role changed")
        }}
      />
    </section>
  )
}

function Invites({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { results, status } = usePaginatedQuery(
    api.invites.list,
    { workspaceId },
    { initialNumItems: 50 }
  )
  const create = useAction(api.invites.create)
  const revoke = useMutation(api.invites.revoke)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("viewer")
  const [link, setLink] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const token = await create({ workspaceId, email, role })
      setLink(
        `${window.location.origin}/invite?token=${encodeURIComponent(token)}`
      )
      setEmail("")
    } catch {
      toast.error("Could not create the invite")
    } finally {
      setSaving(false)
    }
  }

  async function remove(inviteId: Id<"workspaceInvites">) {
    setSaving(true)
    try {
      await revoke({ workspaceId, inviteId })
      toast.success("Invite revoked")
    } catch {
      toast.error("Could not revoke the invite")
    } finally {
      setSaving(false)
    }
  }

  const now = Date.now()
  return (
    <aside aria-labelledby="invite-heading" className="flex flex-col gap-4">
      <h2 id="invite-heading" className="text-base font-semibold">
        Invite a member
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => {
              const next = parseInviteRole(value)
              if (next) setRole(next)
            }}
          >
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {INVITE_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create invite link"}
        </Button>
        <p className="text-xs text-muted-foreground">
          The invited person can see this workspace&apos;s data for their role.
        </p>
      </form>
      {link && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <p className="text-sm font-medium">
            Send this link to the person. You cannot see it again. Only a user
            with the invited email can use it, within 7 days.
          </p>
          <code className="rounded-sm bg-muted p-2 text-xs break-all">
            {link}
          </code>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                toast.success("Invite link copied")
              } catch {
                toast.error("Could not copy the link")
              }
            }}
          >
            Copy link
          </Button>
        </div>
      )}
      <h3 className="text-sm font-semibold">Pending invites</h3>
      {status === "LoadingFirstPage" ? (
        <LoadingRows label="Loading invites" rows={2} />
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pending invites. Links you create appear here until accepted.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((invite) => (
            <li
              key={invite._id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span
                  className="truncate text-sm font-medium"
                  title={invite.email}
                >
                  {invite.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[invite.role]} ·{" "}
                  {invite.expiresAt <= now
                    ? "Expired"
                    : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                </span>
              </div>
              <ConfirmButton
                variant="outline"
                size="sm"
                disabled={saving}
                title={`Revoke the invite for ${invite.email}?`}
                description="The link stops working at once."
                confirmLabel="Revoke"
                destructive
                onConfirm={() => void remove(invite._id)}
              >
                Revoke
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
