# MEMORY.md — Lịch sử quyết định & sự cố

> Nhật ký theo thời gian. Mục đích: người/AI sau này không lặp lại sai lầm đã trả giá,
> và hiểu ĐÚNG bối cảnh đằng sau mỗi quyết định thiết kế (nhiều quyết định trong
> `TECH.md` sẽ khó hiểu nếu không biết vì sao — file này là phần "vì sao").

## 2026-09-29 — Khởi tạo dự án

**Bối cảnh:** Giảng viên DSC tạo được Course/Chapter/Lesson đầu tiên trên Frappe LMS
(sau một chuỗi vướng mắc về quyền hạn — xem lịch sử hội thoại gốc/`docs/plans` của repo
`erpnext` nếu cần), nhưng nhận ra trình soạn bài quá đơn sơ: không thể chèn thế cờ (FEN)
hay ván đấu xem lại được (PGN) — nhu cầu cốt lõi của một trung tâm dạy cờ vua.

**Ràng buộc do người dùng đặt ra ngay từ đầu:** giải pháp không được sửa source app
`lms`, vì hạ tầng DSC build Docker image bằng cách `git clone` lại `lms` mới hoàn toàn
từ GitHub mỗi lần rebuild — sửa trực tiếp sẽ mất sạch ở lần rebuild sau.

**Khảo sát kỹ thuật (trước khi viết dòng code nào):** dùng 2 agent nghiên cứu song song
— (1) đọc thẳng mã nguồn `frappe/lms` qua GitHub API để hiểu cơ chế lưu/render/sanitize
nội dung Lesson, (2) khảo sát thư viện JS FEN/PGN license permissive. Kết quả xem
`TECH.md` mục 1 và 3.4. Kết luận quan trọng nhất giai đoạn này: **không thể nhúng
iframe/HTML thô qua editor** — điều này loại bỏ hướng tiếp cận "hiển nhiên" ban đầu và
dẫn tới hướng "xử lý DOM sau khi render" (mục 2 `TECH.md`).

**Quyết định kiến trúc:** custom Frappe app riêng (`dsc_chess`), dùng cơ chế
`web_include_js` (giả định lúc đó là sẽ hoạt động — **sai**, xem sự cố bên dưới) +
MutationObserver quét marker text + `cm-chessboard`/`chess.js` tải động từ CDN.

## 2026-09-29 — Sự cố #1: Sập toàn bộ site production ~5 phút

**Điều gì xảy ra:** lần deploy đầu tiên (`git clone` + `pip install -e` +
`bench install-app dsc_chess` + `bench build`) chỉ thực hiện trong container
`erpnext-backend`. Ngay sau `bench install-app`, MỌI request tới site (`/`, `/app`,
`/lms`, `/api/*`) trả về HTTP 500, và container `erpnext-queue` rơi vào crash-loop liên
tục (restart mỗi vài giây).

**Nguyên nhân gốc:** `bench install-app` ghi `dsc_chess` vào DB (`installed_apps`) +
`sites/apps.txt` — cả hai đều nằm trên volume `sites/` DÙNG CHUNG giữa mọi container
của site này. Từ thời điểm đó, MỌI container xử lý site này (kể cả không liên quan gì
tới tính năng mới) đều thử `import dsc_chess` khi resolve app đã cài — nhưng package
Python chỉ thực sự tồn tại (qua `pip install -e`) trong container `erpnext-backend`.
Các container khác (`erpnext-queue`, `erpnext-scheduler`) gặp
`ModuleNotFoundError: No module named 'dsc_chess'` → toàn bộ xử lý request/job cho site
này thất bại.

**Cách phát hiện:** `docker logs --tail 100 erpnext-backend` cho traceback đầy đủ,
`docker ps` cho thấy `erpnext-queue` ở trạng thái `Restarting (1)`.

**Cách khắc phục (khẩn cấp, để khôi phục site trước, sửa đúng sau):**
1. `docker restart erpnext-backend erpnext-queue erpnext-scheduler erpnext-websocket` —
   backend hồi phục ngay (vì package đã có sẵn ở đó), nhưng queue/scheduler VẪN
   crash-loop tiếp (restart không tự thêm package còn thiếu).
2. Vì `docker exec` không dùng được với container đang restart liên tục (`Error
   response... Container is restarting`), dùng `docker cp` (hoạt động bất kể trạng
   thái container) copy trực tiếp `apps/dsc_chess` + 2 artifact của `pip install -e`
   (`dsc_chess.pth`, `dsc_chess-0.1.0.dist-info`) từ `erpnext-backend` (đã cài đúng)
   sang `erpnext-queue`/`erpnext-scheduler`.
3. `docker restart` lại 2 container đó — ổn định ngay, không còn crash-loop.

**Bài học đã đưa vào `AGENTS.md`/`TECH.md` mục 6 để không lặp lại:** luôn cài package
Python vào MỌI container chạy Python của site TRƯỚC KHI chạy `bench install-app`.

## 2026-09-29 — Sự cố #2: Static asset 404 dù backend đã build xong

**Điều gì xảy ra:** `/assets/dsc_chess/js/...` trả 404 dù `bench build --app dsc_chess`
chạy thành công trong `erpnext-backend` và tạo symlink `sites/assets/dsc_chess` đúng.

**Nguyên nhân:** `erpnext-frontend` (nginx) phục vụ static file từ
`/home/frappe/frappe-bench/assets` — một thư mục THẬT (không phải symlink tới
`sites/assets`) được populate RIÊNG cho từng container lúc khởi động (log thấy dòng
"Linking fresh assets to volume..." — script entrypoint của image). Symlink
`sites/assets/dsc_chess` (tạo trong backend) trỏ tới `apps/dsc_chess/...` — đường dẫn
CHỈ tồn tại vật lý trong container backend, nên khi frontend resolve cùng 1 symlink
(nhìn thấy qua volume chung `sites/`) thì target không tồn tại trong chính filesystem
của nó.

**Cách khắc phục:** `docker cp` copy `apps/dsc_chess` sang `erpnext-frontend`, rồi tạo
symlink cục bộ `ln -sf apps/dsc_chess/dsc_chess/public assets/dsc_chess` NGAY TRONG
container frontend (không dựa vào symlink tạo từ backend qua volume chung). Đúng
pattern đã ghi nhận trước đó cho app `crm`/`education` trong
`docs/plans/crm_white_screen_fix_report.md` (repo `erpnext`) — lẽ ra nên tra cứu tài
liệu này SỚM HƠN để tránh mất thời gian dò lại từ đầu.

## 2026-09-29 — Phát hiện: `web_include_js` không chạm tới `/lms/*`

Giả định ban đầu (dựa trên hiểu biết chung về Frappe Framework) là `web_include_js` sẽ
tự động chèn script vào mọi trang website, bao gồm `/lms/*`. **Kiểm chứng thực tế bằng
`curl` cho thấy giả định này sai** — xem `TECH.md` mục 4 để biết nguyên nhân kỹ thuật
đầy đủ (route `/lms/*` render qua template độc lập không extend base Frappe).

Trong lúc tìm nguyên nhân, đã **patch nhầm 1 file** (`apps/lms/lms/public/frontend/
index.html` — artifact build không thực sự được serve cho route `/lms`) trước khi tìm
ra đúng file cần patch (`apps/lms/lms/www/_lms.html`). File patch nhầm này vô hại
(không ai đọc/serve nó) nhưng đã dọn `.bak` liên quan sau khi xác nhận xong (xem cuối
file này).

Sau khi patch đúng file + `bench --site ... clear-cache` + `docker restart
erpnext-backend`: script xuất hiện đúng trong HTML trả về, xác nhận qua `curl | grep
dsc_chess`.

## 2026-09-29 — Sự cố #3: Treo trang soạn bài do `innerText`

**Điều gì xảy ra:** sau khi mọi thứ deploy xong, test qua trình duyệt (claude-in-chrome)
bằng cách gõ marker `FEN: ...` vào trình soạn bài — trang treo hẳn (lệnh chụp màn hình
CDP timeout 30 giây, "renderer may be frozen").

**Nguyên nhân:** bản đầu của hàm quét dùng `el.innerText` để đọc nội dung từng phần tử.
`innerText` buộc trình duyệt tính lại layout đồng bộ. Trang soạn bài (EditorJS) đổi DOM
liên tục theo từng phím gõ, `MutationObserver` (quét lại `document.body`) trigger liên
tục → hàng loạt reflow đồng bộ dồn dập trong thời gian ngắn → treo tab.

**Cách khắc phục:** đổi `innerText` → `textContent` (không gây reflow), thu hẹp
`querySelectorAll` còn `p, div` (bỏ `span`), thêm bước lọc `indexOf` rẻ trước khi chạy
regex đầy đủ, tăng debounce 200ms → 400ms. Đã đóng tab cũ (không rõ trạng thái sau
treo), mở tab mới, gõ lại — không còn treo. Chi tiết thuật toán sau khi sửa: `TECH.md`
mục 3.3.

## 2026-09-29 — Xác nhận FEN hoạt động end-to-end

Test trên khóa học thật `step-1-trainer` (Desk: `/app/lms-course/step-1-trainer`), gõ
`FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` vào 1 block riêng.
Xác nhận: hiện đúng bàn cờ SVG ngay trong editor (bonus, không bắt buộc), **sống sót
qua reload trang đầy đủ** (xác nhận lưu đúng ở server, không chỉ render tạm client),
và hiện đúng ở giao diện học viên thật (`/lms/courses/step-1-trainer/learn/1-2?studentView=1`).
Console sạch, không lỗi.

## 2026-09-29 — Persist vào Dockerfile production

Backup Dockerfile gốc (`Dockerfile.bak-<timestamp>`), thêm 1 `RUN` block mới sau block
`lms` (clone `dsc_chess` + `pip install -e` + symlink asset + patch `_lms.html`, có
`test -f`/`grep -q` để build fail rõ ràng nếu patch không áp dụng được thay vì mất tính
năng âm thầm). Chưa chạy `docker compose build` đầy đủ để xác nhận Dockerfile mới build
thành công từ đầu — quyết định có chủ đích: không có staging, rebuild đầy đủ tốn thời
gian/rủi ro downtime, và tính năng đã chạy tốt trên production qua các thay đổi live.
Để dành xác nhận vào lần rebuild thật tiếp theo (ví dụ khi nâng cấp `lms`/`erpnext`).

Dọn 2 file `.bak` phát sinh trong lúc debug bên trong container backend:
`apps/lms/lms/www/_lms.html.bak`, `apps/lms/lms/public/frontend/index.html.bak`.

## 2026-09-29 — Xác nhận PGN hoạt động end-to-end

Tạo 1 lesson mới riêng trên `step-1-trainer` để test (không đụng lesson FEN đã có), gõ
`PGN: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O
1-0` (khai cuộc Ruy Lopez, 16 ply). Xác nhận đúng: bàn cờ + nhãn "X / 16 (SAN)" + 4 nút
điều hướng; bấm Next nhiều lần, zoom pixel-level kiểm tra vị trí quân sau ply 3 ("Nf3")
khớp chính xác; bấm Last nhảy đúng ply 16 ("O-O"), nút tự disable đúng ở 2 đầu. Xác
nhận cả ở editor lẫn giao diện học viên thật. Console sạch.

Gặp 1 lần "renderer frozen" (CDP timeout) khi bấm nút Last — retry sau vài giây thì
phục hồi, và xác nhận cú click đó **chưa hề đăng ký** (vị trí bàn cờ không đổi trước/sau)
→ kết luận đây là chập chờn của bản thân công cụ điều khiển trình duyệt
(claude-in-chrome), không phải bug trong `dsc_chess_lesson_embed.js`.

## Quyết định chưa hoàn tất / còn bỏ ngỏ (để không quên)

- **Chưa vendor `cm-chessboard`/`chess.js` cục bộ** — đang phụ thuộc CDN jsDelivr lúc
  runtime. Đã cân nhắc (xem `TECH.md` mục 3.4) nhưng quyết định giữ CDN vì
  `cm-chessboard` không có bản single-file chính thức, vendor đúng cách tốn công hơn
  giá trị nhận được ở quy mô hiện tại. Nếu DSC mở rộng nhiều và cần độc lập CDN, đây là
  việc cần làm lại.
- **Chưa xác nhận Dockerfile build thành công từ đầu** trên 1 lần rebuild thật (không
  có staging để thử trước).
- **Cú pháp PGN đa dòng/đầy đủ header** — chưa làm, cần spike riêng trước (xem
  `TECH.md` mục 3.2).
- **Công cụ authoring `/chess-fen-builder`** — ý tưởng đã có trong kế hoạch gốc, chưa
  triển khai.
