import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { TemplateEditor } from "@/components/automation/template-editor";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getTemplateForEdit, type TemplateEdit } from "@/server/services/automation-editor";
import { ServiceError } from "@/server/services/errors";

export const metadata: Metadata = { title: "Message template" };

export const dynamic = "force-dynamic";

const BLANK: TemplateEdit = {
  id: null,
  key: "",
  name: "",
  channel: "WHATSAPP",
  category: "TRANSACTIONAL",
  language: "en",
  subject: null,
  body: "",
  providerTemplateId: null,
  active: true,
};

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE)) {
    return <NoAccess title="Message template" what="to edit message templates" backHref="/admin" backLabel="Back to the admin overview" />;
  }

  let template = BLANK;
  if (templateId !== "new") {
    try {
      template = await getTemplateForEdit(actor, templateId);
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={template.id ? template.name : "New message template"}
        description="What a patient receives. Details in {{braces}} are filled in when it is sent."
        actions={
          <Button asChild variant="ghost">
            <Link href="/admin/communications"><ArrowLeft />Communications</Link>
          </Button>
        }
      />
      <TemplateEditor template={template} />
    </PageBody>
  );
}
