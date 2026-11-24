// 时序：世界时间 = 现实时间 1:1，读取系统本地时间，无倍率、无独立时钟
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function partOfDay(h) {
  if (h >= 5 && h < 8) return '清晨';
  if (h >= 8 && h < 11) return '上午';
  if (h >= 11 && h < 13) return '中午';
  if (h >= 13 && h < 17) return '下午';
  if (h >= 17 && h < 19) return '傍晚';
  if (h >= 19 && h < 23) return '夜晚';
  return '深夜';
}

export function seasonOf(month) {
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

export function worldNow(now = new Date()) {
  const h = now.getHours();
  return {
    iso: now.toISOString(),
    local: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    weekday: WEEK[now.getDay()],
    hour: h,
    partOfDay: partOfDay(h),
    season: seasonOf(now.getMonth() + 1),
    timeRatio: 1,
    holidayHint: h >= 0 && h < 6 ? '深夜时段，适合安静的小事' : ''
  };
}
