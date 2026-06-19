import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TemplateEditor } from '@/components/sms/TemplateEditor'

type Props = { params: Promise<{ id: string }> }

export default async function EditTemplatePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: template } = await service
    .from('message_templates')
    .select('id, name, body_template')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!template) redirect('/admin/sms/templates')

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">Edit Template</h1>
      <TemplateEditor
        mode="edit"
        templateId={template.id}
        initialName={template.name}
        initialBody={template.body_template}
      />
    </div>
  )
}
