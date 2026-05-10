import { fetchProfileData } from "./_profile-data";

export async function ProfileLastOpened({
  userId,
  userCreatedAt,
}: {
  userId: string;
  userCreatedAt: string | null;
}) {
  const data = await fetchProfileData(userId, userCreatedAt);
  if (!data.lastOpenedTime) return null;
  return (
    <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-3">
      last opened today · {data.lastOpenedTime}
    </div>
  );
}
