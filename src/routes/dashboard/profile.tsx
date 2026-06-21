import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "#/components/profile-form.tsx";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <main className="flex flex-1 flex-col p-4 md:p-6">
      <ProfileForm />
    </main>
  );
}
