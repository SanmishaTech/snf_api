const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to find or create cart for user/member
async function getOrCreateCart(user) {
  // Try to find existing cart by userId, memberId, or userUniqueId
  let cart = await prisma.cart.findFirst({
    where: {
      OR: [
        { userId: user.id },
        user.member ? { memberId: user.member.id } : null,
        user.userUniqueId ? { userUniqueId: user.userUniqueId } : null
      ].filter(Boolean)
    },
    include: { items: true }
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: {
        userId: user.id,
        memberId: user.member ? user.member.id : null,
        userUniqueId: user.userUniqueId || null
      },
      include: { items: true }
    });
  }
  return cart;
}

exports.getCart = async (req, res) => {
  try {
    const user = req.user; // populated by auth middleware
    const cart = await getOrCreateCart(user);
    res.json({ success: true, cart });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cart' });
  }
};

exports.syncCart = async (req, res) => {
  try {
    const user = req.user;
    const { items } = req.body; // Array of localStorage cart items

    const cart = await getOrCreateCart(user);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.json({ success: true, cart });
    }

    // Merge logic: for each item, if it exists in DB, we can sum quantities or overwrite. 
    // Usually on login, if it's in localStorage but not in DB, add it.
    // If it's in both, perhaps overwrite with local or keep max. Let's add ones missing, and overwrite quantity.

    for (const localItem of items) {
      const existingItem = cart.items.find(i => i.variantId === localItem.variantId);
      if (existingItem) {
        // Update quantity
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: localItem.quantity,
            // also update prices if they changed locally? (better not, rely on product price if possible, but cart stores snapshot)
            price: localItem.price || existingItem.price,
          }
        });
      } else {
        // Create new cart item
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: localItem.productId,
            variantId: localItem.variantId,
            quantity: localItem.quantity,
            name: localItem.name,
            variantName: localItem.variantName,
            price: localItem.price || 0,
            imageUrl: localItem.imageUrl,
            depotId: localItem.depotId,
            originalDepotId: localItem.originalDepotId,
            originalVariantId: localItem.originalVariantId
          }
        });
      }
    }

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: true }
    });

    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error syncing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to sync cart' });
  }
};

exports.addOrUpdateItem = async (req, res) => {
  try {
    const user = req.user;
    const itemData = req.body;
    
    // Validate required fields
    if (!itemData.productId || !itemData.variantId) {
      return res.status(400).json({ success: false, message: 'productId and variantId are required' });
    }

    const cart = await getOrCreateCart(user);

    const existingItem = cart.items.find(i => i.variantId === itemData.variantId);

    if (existingItem) {
      // Update quantity
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: itemData.quantity,
        }
      });
    } else {
      // Create new
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: itemData.productId,
          variantId: itemData.variantId,
          quantity: itemData.quantity,
          name: itemData.name,
          variantName: itemData.variantName,
          price: itemData.price || 0,
          imageUrl: itemData.imageUrl,
          depotId: itemData.depotId,
          originalDepotId: itemData.originalDepotId,
          originalVariantId: itemData.originalVariantId
        }
      });
    }

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: true }
    });

    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error adding/updating item:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart item' });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const user = req.user;
    const variantId = parseInt(req.params.variantId, 10);
    
    const cart = await getOrCreateCart(user);
    const existingItem = cart.items.find(i => i.variantId === variantId);

    if (existingItem) {
      await prisma.cartItem.delete({
        where: { id: existingItem.id }
      });
    }

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: true }
    });

    res.json({ success: true, cart: updatedCart });
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ success: false, message: 'Failed to remove cart item' });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const user = req.user;
    const cart = await getOrCreateCart(user);

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
};
