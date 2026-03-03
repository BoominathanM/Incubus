import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

/**
 * Export an array of row objects to an Excel (.xlsx) file download.
 * @param {object[]} rows   - plain objects; each key becomes a column header
 * @param {string}   filename - file name without extension
 */
export function exportToExcel(rows, filename = 'export') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orders')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/** Format a date value for Excel cells */
export function fmtDate(d) {
  return d ? dayjs(d).format('YYYY-MM-DD HH:mm') : ''
}
