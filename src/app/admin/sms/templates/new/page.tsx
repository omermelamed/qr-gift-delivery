import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TemplateEditor } from '@/components/sms/TemplateEditor'
import { PageHeading } from '@/components/sms/PageHeading'

export default async function NewTemplatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeading text="New Template" />
      <TemplateEditor mode="create" />
    </div>
  )
}
