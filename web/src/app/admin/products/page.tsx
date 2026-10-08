import type { Metadata } from "next";
import { ProductsTable } from "@/components/admin/catalog/ProductsTable";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { LOW_STOCK } from "@/content/products";
import { listProducts, productCategoryOptions } from "@/server/admin/catalog-repo";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Products" };

/** Admin / 08 Products (Figma 25:6156). */
export default async function AdminProductsPage() {
  const products = await listProducts();

  return (
    <>
      <AdminTopbar breadcrumb="CMS / Shop / Products" title="Products" />
      <div className={pageStyles.content}>
        <ProductsTable initial={products} categories={productCategoryOptions()} lowStock={LOW_STOCK} />
      </div>
    </>
  );
}
