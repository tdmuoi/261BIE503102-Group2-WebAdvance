/**
 * Nội dung 3 chính sách — lấy nguyên văn từ "Content 1.docx" do nhóm cung cấp
 * (đổi tên "Lightbooks" trong tài liệu thành "Lightbook" cho đúng tên thương hiệu trên web).
 * Trang Chính sách (/policies), link ở chân trang và ô đồng ý khi đăng ký đều dùng dữ liệu này.
 */
export type PolicyId = 'bao-mat' | 'thanh-toan' | 'doi-tra';

export interface Policy {
  id: PolicyId;
  title: string;
  /** Nhãn ngắn ở chân trang (tiếng Anh như Figma footer) */
  footerLabel: string;
  paragraphs: string[];
}

export const POLICIES: Policy[] = [
  {
    id: 'bao-mat',
    title: 'Chính sách bảo mật',
    footerLabel: 'Privacy Policy',
    paragraphs: [
      'Lightbook cam kết bảo vệ tối đa quyền riêng tư và an toàn thông tin cá nhân của mọi khách hàng khi trải nghiệm dịch vụ trên nền tảng. Khi thực hiện giao dịch hoặc đăng ký tài khoản, chúng tôi chỉ thu thập các thông tin cơ bản bao gồm họ tên, số điện thoại, địa chỉ email, địa chỉ giao hàng và lịch sử mua hàng. Những dữ liệu này được sử dụng duy nhất cho mục đích xác nhận đơn hàng, xử lý vận chuyển, hỗ trợ chăm sóc khách hàng và cá nhân hóa trải nghiệm tư vấn sách thông qua công nghệ AI.',
      'Chúng tôi tôn trọng tuyệt đối dữ liệu của bạn và cam kết không mua bán, trao đổi hay chia sẻ thông tin cá nhân cho bất kỳ bên thứ ba nào, ngoại trừ các đối tác vận chuyển và cổng thanh toán trung gian nhằm hoàn tất quá trình giao dịch. Khách hàng luôn sở hữu toàn bộ quyền kiểm soát đối với dữ liệu cá nhân của mình, bao gồm việc gửi yêu cầu tra cứu, cập nhật, chỉnh sửa hoặc xóa bỏ hoàn toàn thông tin khỏi hệ thống của Lightbook bất kỳ lúc nào bằng cách liên hệ trực tiếp với bộ phận hỗ trợ.',
    ],
  },
  {
    id: 'thanh-toan',
    title: 'Chính sách thanh toán',
    footerLabel: 'Payment Policy',
    paragraphs: [
      'Nhằm mang lại sự thuận tiện tối đa cho độc giả, Lightbook hỗ trợ đa dạng các phương thức thanh toán linh hoạt và an toàn. Khách hàng có thể dễ dàng lựa chọn thanh toán qua các ví điện tử phổ biến như Momo, cổng thanh toán VNPay, chuyển khoản ngân hàng trực tiếp hoặc sử dụng hình thức thanh toán khi nhận hàng áp dụng cho đơn hàng sách giấy. Hệ thống sẽ ngay lập tức gửi email thông báo xác nhận tự động kèm mã vận đơn theo dõi ngay sau khi giao dịch thanh toán trực tuyến hoàn tất thành công.',
      'Trong các trường hợp phát sinh hủy đơn hàng trước khi vận chuyển hoặc sản phẩm nhận được gặp lỗi kỹ thuật từ nhà sản xuất, Lightbook áp dụng chính sách hoàn tiền minh bạch và nhanh chóng. Khoản tiền thanh toán sẽ được hoàn trả lại tài khoản gốc hoặc ví điện tử của khách hàng trong vòng 3 đến 5 ngày làm việc kể từ thời điểm yêu cầu hủy đơn hoặc đổi trả được bộ phận chăm sóc khách hàng phê duyệt chính thức.',
    ],
  },
  {
    id: 'doi-tra',
    title: 'Chính sách mua hàng & đổi trả',
    footerLabel: 'Purchase & Returns',
    paragraphs: [
      'Lightbook luôn nỗ lực đảm bảo mọi sản phẩm gửi tới tay người đọc đều đạt chất lượng tốt nhất, đồng thời cam kết bảo vệ quyền lợi khách hàng thông qua chính sách đổi trả công bằng. Độc giả có thể gửi yêu cầu đổi trả sản phẩm trong vòng 7 ngày kể từ khi nhận hàng nếu sách bị lỗi in ấn, rách trang, hỏng gáy nặng hoặc giao sai tựa sách so với đơn đặt hàng. Quy trình đổi trả được thực hiện đơn giản bằng cách liên hệ bộ phận hỗ trợ, cung cấp hình ảnh hoặc video bằng chứng, sau đó gửi trả sản phẩm để Lightbook tiến hành kiểm tra và gửi sản phẩm thay thế hoàn toàn miễn phí vận chuyển.',
      'Để đảm bảo tính minh bạch và đặc thù của từng loại hình sản phẩm, chính sách đổi trả sẽ không áp dụng đối với các mã kích hoạt ebook đã được mở hoặc truy cập thành công trên hệ thống. Tương tự, đối với các sản phẩm sách cũ thuộc danh mục thanh lý đã được mô tả chi tiết tình trạng thực tế trước khi giao dịch, Lightbook xin phép không hỗ trợ đổi trả vì lý do thay đổi sở thích cá nhân sau khi đã nhận hàng.',
    ],
  },
];

/** Đoạn "Sứ Mệnh & Tầm Nhìn" cho trang Về chúng tôi (Content 1.docx) */
export const MISSION_VISION = [
  'Lightbook ra đời với sứ mệnh xóa bỏ rào cản chi phí trong việc tiếp cận tri thức, giúp mọi đối tượng độc giả dễ dàng tìm thấy cuốn sách phù hợp với nhu cầu của bản thân. Bằng cách kết hợp linh hoạt giữa các mô hình sách mới, sách cũ tuyển chọn và kho ebook hiện đại, cùng sự hỗ trợ thông minh từ công nghệ AI tư vấn cá nhân hóa, Lightbook đem đến trải nghiệm tìm kiếm và thưởng thức tri thức tối ưu nhất cho từng khách hàng.',
  'Trong tương lai, Lightbook hướng tới mục tiêu trở thành nền tảng sách tiêu dùng xanh hàng đầu tại Việt Nam, góp phần giảm thiểu rác thải giấy và lan tỏa lối sống bền vững trong cộng đồng. Chúng tôi không chỉ đơn thuần là một trang thương mại điện tử, mà còn hướng đến việc xây dựng một hệ sinh thái kết nối chặt chẽ giữa người đọc, người bán sách cũ và các tác giả, cùng nhau nuôi dưỡng tình yêu văn hóa đọc và gìn giữ màu xanh cho hành tinh.',
];
