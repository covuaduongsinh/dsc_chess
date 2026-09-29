# SKILLS.md — Playbook tái sử dụng cho các custom app khác của DSC

> Đúc kết từ quá trình xây `dsc_chess` thành các quy trình/checklist có thể áp dụng lại
> nguyên xi khi DSC cần xây thêm custom app Frappe khác (ví dụ: tính năng riêng cho
> Education, CRM, hay module mới hoàn toàn). Đây chính là phần "làm cơ sở để nhân bản
> phần mềm" — coi mỗi mục dưới đây là 1 kỹ năng/khuôn mẫu độc lập, tái dùng được.

## Skill 1: Mở rộng một Frappe app (bất kỳ) mà KHÔNG được sửa source của nó

**Áp dụng khi:** hạ tầng build lại app từ Git mỗi lần rebuild image (như DSC đang làm
với `education`/`crm`/`payments`/`lms`), nên mọi sửa đổi trực tiếp vào `apps/<app>` sẽ
mất ở lần rebuild sau.

**Quy trình:**
1. Tạo 1 app Frappe MỚI, tên riêng biệt (không đụng namespace app gốc), qua
   `bench new-app` trên máy dev hoặc viết tay cấu trúc tối thiểu (xem cấu trúc
   `dsc_chess/` làm mẫu — không cần DocType nếu tính năng thuần frontend).
2. Đẩy lên 1 repo GitHub riêng của DSC.
3. Khảo sát KỸ trước khi thiết kế: đọc mã nguồn thật của app gốc (qua GitHub, đừng đoán
   từ kiến thức chung về Frappe) để biết chính xác: dữ liệu lưu dưới định dạng gì, có
   bị sanitize/lọc không, trang render qua cơ chế nào (boilerplate chuẩn Frappe hay
   template riêng — xem Skill 3). Nếu khảo sát cho thấy cần sửa source mới làm được,
   DỪNG LẠI và bàn với người quyết định trước khi tự ý phá nguyên tắc.
4. Thiết kế giải pháp đứng NGOÀI pipeline lưu trữ/render gốc — ví dụ dùng
   `hooks.py` (`doc_events`, `override_doctype_class`, `web_include_js`,
   `website_route_rules`, `fixtures` cho Custom Field/Client Script) hoặc xử lý ở tầng
   DOM đã render (xem Skill 4).
5. Tích hợp vào Dockerfile theo đúng pattern các app đã có (1 `RUN` block: clone + pip
   install + symlink asset), thêm vào `apps.txt`.

## Skill 2: Deploy an toàn lên site Frappe production nhiều container, KHÔNG có staging

**Áp dụng khi:** cần thêm/đổi 1 app trên site đang chạy thật, hạ tầng gồm nhiều
container (`backend`, `queue`, `scheduler`, `websocket`, `frontend`) từ cùng 1 image
nhưng KHÔNG chia sẻ filesystem `apps/`/site-packages (chỉ chia sẻ `sites/`).

**Checklist bắt buộc theo đúng thứ tự** (đảo thứ tự đã từng gây sập site thật — xem
`MEMORY.md` sự cố #1):

1. [ ] Liệt kê TẤT CẢ container chạy Python của site (`docker ps` lọc theo image liên
       quan) — không chỉ container bạn định thao tác.
2. [ ] `git clone` + `pip install -e` app mới vào **MỌI** container ở bước 1 (KHÔNG chỉ
       1 container) — kể cả khi có vẻ chỉ cần test nhanh ở 1 chỗ.
3. [ ] Nếu app có asset tĩnh (JS/CSS/ảnh): tạo symlink asset cục bộ ở **MỌI** container
       phục vụ web trực tiếp (thường là `backend` + `frontend`/nginx) — đừng tin symlink
       tạo qua volume `sites/` dùng chung sẽ tự "lan" sang container khác resolve đúng
       (nó KHÔNG, vì target trỏ ra ngoài volume dùng chung).
4. [ ] CHỈ SAU KHI bước 2+3 xong ở MỌI nơi cần: mới chạy `bench install-app` (đây là
       bước đổi trạng thái DB DÙNG CHUNG — mọi container sẽ ngay lập tức cố resolve app
       mới cho site này).
5. [ ] `docker restart` các container đã thêm package Python (để nạp lại `sys.path`).
6. [ ] Kiểm tra sức khỏe TOÀN site ngay sau đó: `/`, `/login`, `/api/method/ping`, và
       route đặc thù của app vừa thêm — không chỉ kiểm tra route liên quan tính năng
       mới.
7. [ ] `docker ps` xem có container nào ở trạng thái `Restarting` không (dấu hiệu
       crash-loop) — kiểm tra NGAY, đừng đợi người dùng báo lỗi.

**Nếu lỡ rơi vào crash-loop:** container crash-loop không nhận `docker exec` (báo lỗi
"Container is restarting"). Dùng `docker cp` (hoạt động bất kể trạng thái container) để
copy trực tiếp source app + artifact `pip install -e` (file `<app>.pth` +
`<app>-*.dist-info` trong `env/lib/python3.11/site-packages/`) từ 1 container ĐÃ cài
đúng sang container đang lỗi, rồi `docker restart`.

## Skill 3: Phát hiện đúng cơ chế render của 1 route trước khi định nhúng script vào đó

**Vấn đề:** không phải mọi route "website" của Frappe đều đi qua boilerplate chuẩn
(nơi `web_include_js`/`app_include_js` có tác dụng). Nhiều SPA hiện đại (Vue/React) do
các app khác build ra tự phục vụ 1 template HTML riêng, KHÔNG extend base template.

**Cách kiểm chứng nhanh, đừng đoán:**
1. Thêm 1 script "spike" tối giản (`console.log(...)`) qua `web_include_js` của 1 app
   thử nghiệm.
2. Mở route cần kiểm tra, **View Page Source (Ctrl+U)** — KHÔNG dùng tab Elements của
   DevTools (Elements phản ánh DOM runtime, không phân biệt được HTML gốc từ server với
   HTML đã bị JS khác chỉnh sau khi tải).
3. `grep` tên script trong HTML gốc. Có → cơ chế chuẩn hoạt động, dùng
   `web_include_js` bình thường. Không có → route này có template riêng, cần tìm đúng
   file template (thường ở `apps/<app>/<app>/www/<route>.html`, do 1 file `.py` cùng
   tên cung cấp `get_context()`) và patch trực tiếp file đó tại build-time trong
   Dockerfile (xem `TECH.md` mục 4 của `dsc_chess` làm ví dụ đầy đủ).
4. **Lưu ý phân biệt:** file `.html` thật sự được serve (nằm trong `<app>/<app>/www/`)
   khác với các bản copy artifact trong `<app>/<app>/public/` — dễ patch nhầm file
   không được serve (đã từng xảy ra, xem `MEMORY.md`). Xác nhận đúng file bằng cách tìm
   route handler `.py` tương ứng trong `www/`, đọc xem nó render template nào.

## Skill 4: Nhúng nội dung tùy biến vào 1 field bị sanitize chặt (kiểu EditorJS/DOMPurify)

**Áp dụng khi:** trường dữ liệu của app gốc không cho nhúng HTML/iframe/script tùy ý
(rất phổ biến ở các app hiện đại vì lý do bảo mật — đừng coi đây là "bug" cần vượt qua).

**Cách tiếp cận đúng:** đừng cố vượt qua sanitize (thường bất khả thi và không nên làm
kể cả nếu khả thi — sanitize tồn tại có lý do bảo mật chính đáng). Thay vào đó:
1. Thiết kế 1 cú pháp **marker bằng text thuần** (không phải markup) mà người dùng gõ
   được qua editor chuẩn — text thuần luôn sống sót qua mọi tầng sanitize vì nó không
   phải là thứ bị lọc.
2. Viết 1 script độc lập, chạy SAU khi trang đã render xong (nội dung lúc này đã qua
   sanitize, an toàn), quét DOM tìm marker, tự mount widget bằng JS thuần tại đúng vị
   trí.
3. Xem `Skill 5` để tránh script quét này tự gây ra vấn đề hiệu năng.

## Skill 5: Viết `MutationObserver` quét DOM an toàn, không tự gây treo trang

Áp dụng cho bất kỳ script nào cần quét lại DOM mỗi khi trang thay đổi (ví dụ Skill 4).

- **Không bao giờ dùng `el.innerText`** trong vòng lặp quét nhiều phần tử — luôn dùng
  `el.textContent`. `innerText` buộc tính lại layout đồng bộ cho từng phần tử, cực kỳ
  tốn kém khi lặp qua hàng trăm node mỗi lần DOM đổi.
- Debounce mutation callback (300–500ms hợp lý cho hầu hết trường hợp), KHÔNG xử lý
  trực tiếp trong callback của `MutationObserver`.
- Lọc nhanh, rẻ TRƯỚC khi chạy logic nặng (regex đầy đủ, parse...): ví dụ
  `text.indexOf("PREFIX") !== -1` trước khi `regex.exec(text)`.
- Chỉ xét node "lá" (`el.children.length === 0`) nếu marker luôn nằm trong 1 phần tử
  không lồng nhau — giảm đáng kể số phần tử phải kiểm tra.
- Dùng `WeakSet` đánh dấu phần tử đã xử lý, tránh xử lý lặp lại vô ích.
- Test bằng cách gõ liên tục, nhanh, vào editor thật của app đích TRƯỚC khi coi là
  xong — DOM của các block-editor hiện đại (EditorJS, TipTap...) đổi liên tục theo
  từng phím gõ, là kịch bản tệ nhất cho hiệu năng của `MutationObserver`.

## Skill 6: Chọn thư viện JS bên thứ 3 cho một custom app thương mại nhỏ

- Ưu tiên giấy phép permissive (MIT, BSD, Apache-2.0) — tránh GPL/AGPL nếu app sẽ là
  một phần của sản phẩm thương mại đóng gói/phân phối lại (kể cả nội bộ, tùy khẩu vị
  rủi ro pháp lý của DSC).
- Ưu tiên thư viện nhúng được qua CDN `<script>` thuần, không cần bundler — giảm độ
  phức tạp triển khai đáng kể cho 1 custom app nhỏ không có pipeline build riêng.
- Kiểm tra: có bản UMD/single-file chính thức không, hay chỉ ship ES module đa file
  (ảnh hưởng quyết định vendor cục bộ hay phụ thuộc CDN runtime — xem `TECH.md` mục
  3.4 để biết ví dụ đánh đổi thực tế).
