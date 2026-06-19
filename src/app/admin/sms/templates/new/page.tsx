import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TemplateEditor } from '@/components/sms/TemplateEditor'

export default async function NewTemplatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">New Template</h1>
      <TemplateEditor mode="create" />
    </div>
  )
}
