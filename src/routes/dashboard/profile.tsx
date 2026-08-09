import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "#/components/profile-form.tsx";
import { CandidateMemoryForm } from "#/components/candidate-memory-form.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <Tabs defaultValue="memory">
        <TabsList aria-label="Candidate information">
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="resume">Resume profile</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6" value="memory">
          <CandidateMemoryForm />
        </TabsContent>
        <TabsContent className="mt-6" value="resume">
          <ProfileForm />
        </TabsContent>
      </Tabs>
    </main>
  );
}
