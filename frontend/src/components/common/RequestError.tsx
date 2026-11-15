import { Alert, Button } from 'antd'
import { errorText } from '../../services/apiErrors'
export function RequestError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null
  return <Alert type="error" showIcon title={errorText(error)} action={retry && <Button onClick={retry}>Thử lại</Button>} />
}
