import { UserAvatar as BaseUserAvatar } from "@/components/common/UserAvatar";

/**
 * The flagged-user box: a sized, ringed avatar.
 *
 * This owns the box (three sizes, a risk-coloured ring) and delegates the
 * photo-or-initials decision to the one primitive. It kept its own copy of
 * that decision until the avatar consolidation, which is how the admin
 * surface ended up with several initials rules that disagreed about the
 * empty-name case.
 *
 * It stays in this folder, with this API, because its three siblings call
 * it and the box is specific to them. Living here is also why the rest of
 * the admin surface never found it and inlined the ternary instead.
 */
export function UserAvatar({
  name,
  avatarUrl,
  ringClass,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  ringClass?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sz = size === "sm" ? "w-6 h-6 text-xs" : size === "lg" ? "w-12 h-12 text-sm" : "w-10 h-10 text-xs";
  const ring = ringClass ?? "border-slate-700";
  return (
    <BaseUserAvatar
      url={avatarUrl}
      name={name}
      className={`${sz} rounded-full object-cover border-2 ${ring}`}
      fallbackClassName={`${sz} rounded-full flex items-center justify-center bg-slate-800 text-slate-200 font-semibold border-2 ${ring}`}
    />
  );
}
