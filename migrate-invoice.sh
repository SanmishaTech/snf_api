#!/bin/bash

# Script to run Prisma migration for adding Invoice model

echo "Starting Prisma migration for Invoice model..."

# Navigate to backend directory if not already there
cd "$(dirname "$0")"

# Run Prisma migration
echo "Creating migration..."
npx prisma migrate dev --name add_invoice_model

echo "Migration completed!"

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

echo "Prisma client generated successfully!"
echo "Invoice model migration completed successfully!"
