import bodyParser from 'body-parser'
import cors from 'cors'
import {
  addEdgeCorePlugins,
  EdgeAccount,
  EdgeContext,
  EdgeCurrencyWallet,
  EdgeSpendInfo,
  EdgeSpendTarget,
  EdgeTransaction,
  lockEdgeCorePlugins,
  makeEdgeContext
} from 'edge-core-js'
import bitcoinPlugins from 'edge-currency-bitcoin'
import express from 'express'

import CONFIG from '../config.json'
addEdgeCorePlugins(bitcoinPlugins)
lockEdgeCorePlugins()

async function main(): Promise<void> {
  const app = express()

  // Start the core, with Bitcoin enabled:
  const context: EdgeContext = await makeEdgeContext({
    apiKey: CONFIG.apiKey,
    appId: CONFIG.appId,
    plugins: CONFIG.plugins
  })

  // Log in to some user:
  const account: EdgeAccount = await context.loginWithPassword(
    CONFIG.username,
    CONFIG.password
  )

  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())

  // Getting wallet balances based on type of wallet
  app.get('/balances/', async (req, res, next) => {
    const type = req.query.type
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    try {
      const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
        walletInfo.id
      )
      res.json(wallet.balances)
    } catch (e) {
      res.status(500).send('Server error in waitForCurrencyWallet')
    }
  })

  // Get wallet transactions based on type of wallet
  app.get('/transactions/', async (req, res, next) => {
    const type = req.query.type
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    try {
      const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
        walletInfo.id
      )
      const transactions: EdgeTransaction[] = await wallet.getTransactions()
      const cleanTransactions = transactions.filter(value => {
        delete value.wallet
        delete value.amountSatoshi
        delete value.otherParams.debugInfo
        return value
      })
      res.send(cleanTransactions)
    } catch (e) {
      res.status(500).send('Server error in waitForCurrencyWallet')
    }
  })

  app.post('/spend/', async (req, res, next) => {
    const type = req.query.type
    const spendInfo: EdgeSpendInfo = req.body
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
      walletInfo.id
    )
    let edgeTransaction: EdgeTransaction
    try {
      edgeTransaction = await wallet.makeSpend(spendInfo)
    } catch (e) {
      res.status(400).send('Body does not match EdgeSpendInfo specification')
    }
    try {
      const signedTx = await wallet.signTx(edgeTransaction)
      await wallet.broadcastTx(signedTx)
      await wallet.saveTx(signedTx)
      res.send(signedTx)
    } catch (e) {
      res.status(500).send('Internal server error')
    }
  })

  app.listen(CONFIG.httpPort, () => {
    console.log('Server is listening on:', CONFIG.httpPort)
  })
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})
