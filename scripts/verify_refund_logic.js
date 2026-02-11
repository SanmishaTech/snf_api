const { PrismaClient } = require('@prisma/client');
const walletService = require('../src/services/walletService');
const prisma = new PrismaClient();

async function verifyRefundLogic() {
    console.log('Starting verification of refund logic...');

    try {
        // 1. Find a potential delivery to refund (e.g., PENDING status and valid subscription)
        // using rate > 0
        const delivery = await prisma.deliveryScheduleEntry.findFirst({
            where: {
                status: 'PENDING',
                subscription: {
                    rate: { gt: 0 }
                }
            },
            include: {
                subscription: true
            }
        });

        if (!delivery) {
            console.log('No suitable PENDING delivery found for verification. Checking any delivery...');
            // Fallback to any delivery to at least check the calculation logic structure
            const anyDelivery = await prisma.deliveryScheduleEntry.findFirst({
                include: { subscription: true }
            });

            if (anyDelivery) {
                verifyDelivery(anyDelivery);
            } else {
                console.log('No deliveries found in database.');
            }
            return;
        }

        await verifyDelivery(delivery);

    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        await prisma.$disconnect();
    }
}

async function verifyDelivery(delivery) {
    console.log(`Found delivery ID: ${delivery.id}`);
    console.log(`Subscription ID: ${delivery.subscription?.id}`);
    console.log(`Subscription Rate: ${delivery.subscription?.rate}`);
    console.log(`Delivery Quantity: ${delivery.quantity}`);

    // 2. Calculate refund amount
    const refundAmount = walletService.calculateRefundAmount(delivery);
    console.log(`Calculated Refund Amount: ${refundAmount}`);

    const expectedRefund = (delivery.subscription?.rate || 0) * (delivery.quantity || 0);

    if (refundAmount === expectedRefund && refundAmount > 0) {
        console.log('SUCCESS: Refund amount matches expected calculation.');
    } else if (refundAmount === expectedRefund) {
        console.log('INFO: Refund amount matches but is 0 (likely rate is 0 or undefined).');
    } else {
        console.log(`ERROR: Refund amount mismatch. Expected: ${expectedRefund}, Got: ${refundAmount}`);
    }
}

verifyRefundLogic();
