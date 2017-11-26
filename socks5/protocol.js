'use strict'

const dns = require('dns')
const net = require('net')

const { convertIP } = require('../util/ip')

const Socks5Version = 0x05

const AuthNone = 0x00
  , CmdConnect = 0x01

const AddressTypeIpv4 = 0x01
  , AddressTypeDomain = 0x03
  , AddressTypeIpv6 = 0x04

module.exports = class ServerProtocol {
  constructor(conn) {
    this.conn = conn
    this.processor = this.handshake

    this.remoteAddr = null
    this.remotePort = null
    this.remoteAddrRaw = null
  }

  process() {
    let { conn } = this

    conn.on('data', buf => {
      try {
        this.processor(buf)
      } catch (e) {
        console.log('conn 消息监听异常')
        conn.destroy()
      }
    })

    conn.on('error', e => {
      console.log(e)
      conn.destroy()
    })
  }

  // 握手协议一
  // req [ver0x05, method_length, methods]
  // res [0x05, 0x00]
  handshake(buf) {
    console.log('handshake 阶段')

    if (buf[0] !== Socks5Version) {
      console.log('非socks5连接')
      this.conn.destroy()
      return
    }

    this.conn.write(Buffer.from([Socks5Version, AuthNone]))
    this.processor = this.request
  }

  // 握手协议二
  // req [0x05, cmd0x01, 0x00, atype, dst.addr, dst.port]
  // res [0x05, 0x00, 0x00, atype, bnd.addr, bnd.port]
  request(buf) {
    console.log('request 阶段')

    let cmd = buf[1]
    if (cmd !== CmdConnect) {
      console.log('非connect请求')
      this.conn.destroy()
      return
    }

    let atype = buf[3]
    switch (atype) {
      case AddressTypeDomain:
        let domainLen = parseInt(buf[4], 10)
        let domainRaw = buf.slice(5, 5 + domainLen)
        let domain = domainRaw.toString()
        console.log(`目标地址: ${domain}`)

        let portRaw
        let port
        try {
          portRaw = buf.slice(domainLen + 5, domainLen + 7)
          port = parseInt(portRaw.toString('hex'), 16)
          this.remotePort = port
        } catch (e) {
          console.log('端口解析异常')
          this.conn.destroy()
          return
        }

        dns.lookup(domain, {
          family: 4
        }, (err, addr, family) => {
          if (err) {
            console.log(`dns 解析异常 ${domain}`)
            this.conn.destroy()
            return
          }

          this.remoteAddr = addr
          let ipRaw
          try {
            ipRaw = convertIP(addr)
            this.remoteAddrRaw = Buffer.concat([ipRaw, portRaw])
          } catch (e) {
            console.log(e)
            this.conn.destroy()
            return
          }

          console.log(`目标解析ip ${addr} 端口号 ${port}`)

          this.dialRemote()
          this.processor = this.transport
        })
        break
      default:
        console.log('当前请求目标地址格式暂未支持')
        this.conn.destroy()
    }
  }

  dialRemote() {
    let { conn } = this
    let remote = net.createConnection(this.remotePort, this.remoteAddr, () => {
      conn.write(Buffer.from([Socks5Version, 0x00, 0x00, AddressTypeIpv4, ...this.remoteAddrRaw]))
    })

    remote.on('error', e => {
      console.log(e)

      if (conn.destroyed) {
        return
      }
      conn.write(Buffer.from([Socks5Version, 0x04, 0x00, AddressTypeIpv4]), () => {
        remote.destroy()
        conn.destroy()
      })
    })

    remote.on('data', buf => {
      if (conn.destroyed) {
        return
      }
      conn.write(buf)
    })

    this.remote = remote
  }

  // 双关通信
  transport(buf) {
    console.log('transport 阶段')

    if (this.remote && !this.remote.destroyed) {
      this.remote.write(buf)
    }
  }
}