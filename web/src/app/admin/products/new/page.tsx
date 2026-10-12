import type { Metadata } from "next";
import { ProductEditor } from "@/components/admin/catalog/ProductEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { emptyProductForm, productCategoryOptions, siteImageOptions } from "@/server/admin/catalog-repo";
import pageStyles from "../../page.module.css";

export const metadata: Metadata = { title: "Tambah produk" };

export default function AdminNewProductPage() {
  return (
    <>
      <AdminTopbar breadcrumb="CMS / Shop / Products / Tambah" title="Tambah produk" />
      <div className={pageStyles.content}>
        <ProductEditor initial={emptyProductForm()} categories={productCategoryOptions()} imageOptions={siteImageOptions()} />
      </div>
    </>
  );
}
