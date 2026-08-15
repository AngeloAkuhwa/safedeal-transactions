import { initials } from "./risk";

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
  const sz = size === "sm" ? "w-6 h-6 text-[12px]" : size === "lg" ? "w-12 h-12 text-sm" : "w-10 h-10 text-xs";
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sz} rounded-full object-cover border-2 ${ringClass ?? "border-slate-700"}`}
      />
    );
  }
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center bg-slate-800 text-slate-200 font-semibold border-2 ${ringClass ?? "border-slate-700"}`}
    >
      {initials(name)}
    </div>
  );
}