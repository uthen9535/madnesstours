import Link from "next/link";

type ProfileLinkProps = {
  username: string;
  mention?: boolean;
  className?: string;
};

export function ProfileLink({ username, mention = true, className }: ProfileLinkProps) {
  const href = `/profiles/${encodeURIComponent(username)}`;
  return (
    <Link href={href} className={className ? `profile-link ${className}` : "profile-link"}>
      {mention ? `@${username}` : username}
    </Link>
  );
}
