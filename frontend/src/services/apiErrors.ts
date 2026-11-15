import axios from 'axios'
export function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const detail = error.response?.data?.error?.message ?? error.response?.data?.message
    if (status === 401) return 'Phiên đăng nhập hết hạn hoặc thông tin đăng nhập không đúng.'
    if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra kết nối và cấu hình API.'
    if (status === 404) return 'Không tìm thấy dữ liệu hoặc chức năng chưa được máy chủ cung cấp.'
    if (detail) return Array.isArray(detail) ? detail.join('; ') : String(detail)
    return `Máy chủ trả về lỗi ${status}. Vui lòng thử lại.`
  }
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.'
}
