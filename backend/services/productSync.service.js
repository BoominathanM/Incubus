const axios = require('axios')
const AskevaConfig = require('../models/AskevaConfig.model')
const Product = require('../models/Product.model')
const { decrypt } = require('../utils/encryption.util')

/**
 * Fetch products for a specific company and store/update in DB
 * @param {string} companyId - The ID of the company on AskEVA
 */
const syncProducts = async (companyId) => {
    try {
        const config = await AskevaConfig.findOne({ companyId }).select('+apiKey').lean()
        if (!config || !config.apiKey) {
            console.warn(`[Sync] Skipping company ${companyId}: No API key found.`)
            return { success: false, error: 'Askeva configuration not found or API key missing.' }
        }

        const token = decrypt(config.apiKey)
        const backendUrl = config.backendUrl || 'https://backend.askeva.io'
        const url = `${backendUrl}/v1/commerce/products/${companyId}?token=${encodeURIComponent(token)}`

        console.log(`[Sync] Fetching products for company ${companyId}...`)

        // Cleanup: If we are now using a real ID, remove any 'default' products to prevent duplicates
        if (companyId !== 'default') {
            await Product.deleteMany({ companyId: 'default' })
        }

        const response = await axios.get(url)

        // Data can follow different formats, we handle common ones
        let products = []
        if (Array.isArray(response.data)) {
            products = response.data
        } else if (response.data && Array.isArray(response.data.products)) {
            products = response.data.products
        } else if (response.data && Array.isArray(response.data.data)) {
            products = response.data.data
        }

        if (products.length === 0) {
            console.log(`[Sync] No products found for company ${companyId}.`)
            return { success: true, count: 0 }
        }

        let syncedCount = 0
        for (const p of products) {
            // Map AskEVA product to our model
            // We use 'id' or 'product_id' or 'productId' from payload
            const pid = p.id || p.product_id || p.productId || p.item_id
            if (!pid) continue

            const updateData = {
                companyId,
                productId: pid,
                name: p.name || p.title || 'No Name',
                description: p.description || p.desc || '',
                price: p.price || p.sale_price || 0,
                category: p.category || p.category_name || 'General',
                imageUrl: p.image_url || p.imageUrl || p.thumb || '',
                sku: p.sku || '',
                isAvailable: p.is_available !== false && p.stock !== 0,
                rawResponse: p,
                lastSyncedAt: new Date(),
            }

            await Product.findOneAndUpdate(
                { companyId, productId: pid },
                updateData,
                { upsert: true, new: true }
            )
            syncedCount++
        }

        console.log(`[Sync] Successfully synced ${syncedCount} products for company ${companyId}.`)
        await AskevaConfig.updateOne({ companyId }, { lastSyncedAt: new Date() })

        return { success: true, count: syncedCount }
    } catch (error) {
        console.error(`[Sync] Error syncing products for company ${companyId}:`, error.message)
        if (error.response) {
            console.error(`[Sync] API response error:`, error.response.status, error.response.data)
        }
        return { success: false, error: error.message }
    }
}

/**
 * Runs the sync for all enabled companies
 */
const syncAllCompanies = async () => {
    try {
        const configs = await AskevaConfig.find({ isEnabled: true }).select('companyId')
        if (configs.length === 0) {
            console.log('[Sync] No enabled Askeva configurations found.')
            return
        }

        for (const config of configs) {
            await syncProducts(config.companyId)
        }
    } catch (error) {
        console.error('[Sync] Error in batch sync job:', error.message)
    }
}

module.exports = {
    syncProducts,
    syncAllCompanies,
}
