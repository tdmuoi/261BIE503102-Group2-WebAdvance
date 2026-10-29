import { Component } from '@angular/core';

/** "Một cuốn sách, many lives" — 4 bước và số liệu cộng đồng, Figma 829:3091 */
@Component({
  selector: 'app-buyback-cycle',
  standalone: false,
  styleUrls: ['../../../homepage/sections/section-shared.css', './buyback-cycle.css'],
  templateUrl: './buyback-cycle.html',
})
export class BuybackCycle {
  protected readonly steps = [
    {
      no: '01',
      icon: 'step-send',
      tint: 'pink',
      title: 'Bạn gửi sách',
      desc: 'Điền phiếu, chụp vài tấm ảnh rồi gửi sách qua bưu điện hoặc mang đến chi nhánh Lightbook gần nhất.',
      chip: 'Bưu điện / tại chi nhánh',
    },
    {
      no: '02',
      icon: 'step-appraise',
      tint: 'yellow',
      title: 'Thẩm định 48h',
      desc: 'Kiểm tra tình trạng từng cuốn, báo giá minh bạch theo bảng định giá công khai.',
      chip: 'Báo giá trong 48h',
    },
    {
      no: '03',
      icon: 'step-renew',
      tint: 'mint',
      title: 'Làm mới',
      desc: 'Vệ sinh, bọc lại bìa và gắn tem “Đã qua tay” kèm điểm tình trạng của sách.',
      chip: 'Tem tình trạng',
    },
    {
      no: '04',
      icon: 'step-reader',
      tint: 'pink',
      title: 'Đến tay độc giả mới',
      desc: 'Sách lên kệ với giá chỉ 40–60% giá bìa. Vòng đời của sách được nối dài.',
      chip: 'Giá 40–60% bìa',
    },
  ];

  protected readonly impacts = [
    {
      photo: 'impact-books.png',
      alt: 'Chồng sách cũ được làm mới',
      value: '3,2 tấn',
      label: 'giấy được giữ lại',
      line: 'Tương đương hơn 12.000 cuốn sách không cần in mới',
    },
    {
      photo: 'impact-forest.png',
      alt: 'Con đường giữa rừng cây xanh',
      value: '54',
      label: 'cây xanh không phải đốn',
      line: 'Mỗi tấn giấy mới tiêu tốn khoảng 17 cây trưởng thành',
    },
    {
      photo: 'impact-reader.png',
      alt: 'Độc giả chọn sách bên kệ sách cũ',
      value: '8.900',
      label: 'độc giả mua sách giá mềm',
      line: 'Một cuốn sách, nhiều người đọc, tuần hoàn bền vững',
    },
  ];
}
