# CLAUDE.md

Đây là repo custom Frappe app cho DSC. **Đọc [`AGENTS.md`](./AGENTS.md) trước** — đó là
tài liệu chuẩn, đầy đủ nhất, áp dụng cho mọi AI agent (không riêng Claude). File này chỉ
bổ sung vài điểm đặc thù khi làm việc bằng Claude Code trong môi trường thực tế của dự án.

## Đặc thù môi trường

- Máy dev Windows, repo này nằm tại `D:\code\dsc_chess`, KHÔNG phải bench Frappe cục bộ
  (không có `bench` CLI ở máy dev). Mọi lệnh `bench`/`pip install -e`/`git clone` liên
  quan đến việc CÀI app vào site thật đều chạy **qua SSH vào VPS** rồi `docker exec` vào
  container tương ứng, không chạy trực tiếp trên máy dev.
- Test tính năng hiển thị thực tế: dùng công cụ điều khiển trình duyệt (claude-in-chrome
  MCP) để đăng nhập/thao tác trên `erpnext.dsc.edu.vn` thật, KHÔNG có cách nào chạy LMS
  cục bộ để test trước.
- Trước khi thao tác bất kỳ lệnh nào có thể ảnh hưởng production (restart container,
  sửa Dockerfile, `bench install-app`, `docker compose build`), coi đây là hành động rủi
  ro cao/khó đảo ngược theo đúng tinh thần "Executing actions with care" — nên thông báo
  rõ cho người dùng đang làm gì, và xác minh sức khỏe toàn site (`/`, `/login`,
  `/api/method/ping`, `/lms`) ngay sau mỗi thay đổi container.
- Đã từng làm sập site production ~5 phút trong quá trình phát triển ban đầu (xem
  `MEMORY.md`) — luôn kiểm tra kỹ container nào cần đồng bộ package Python trước khi
  đổi trạng thái site.

## Quy ước file tài liệu trong repo này

`AGENTS.md` (chuẩn, chi tiết đầy đủ) → `TECH.md` (kiến trúc/thuật toán) → `MEMORY.md`
(lịch sử/sự cố) → `SKILLS.md` (playbook tái dùng) → `README.md` (tóm tắt cho người
dùng cuối). Khi cập nhật code, luôn cập nhật `MEMORY.md` nếu có quyết định/sự cố mới,
và `TECH.md` nếu thay đổi kiến trúc/thuật toán.
