'use strict'

const net = require('net')
const { port } = require('./config')

const ServerProtocol = require('./socks5/protocol')

const server = net.createServer(socket => {
  console.log(`客户端链接 ${socket.remoteAddress}:${socket.remotePort}`)

  let sp = new ServerProtocol(socket)
  sp.process()
})

server.listen(port)

server.on('error', e => {
  console.error(e)
  process.exit(0)
})

console.log(`Socks5 server start at port ${port}`)