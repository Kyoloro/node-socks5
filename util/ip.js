'use strict'

exports.convertIP = ip => {
  ip = ip.split('.')

  if (ip.length > 4) {
    throw new Error('ipv4 解析异常')
    return
  }

  ip = ip.map(i => parseInt(i))
  return Buffer.from(ip)
}