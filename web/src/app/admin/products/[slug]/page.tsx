import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/catalog/ProductEditor";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { getProductForm, productCategoryOptions, siteImageOptions } from "@/server/admin/catalog-repo";
import pageStyles from "../../page.module.css";

export async function generateMetadata({ params }: PageProps<"/admin/products/[slug]">): Promise<Metadata> {
  const product = await getProductForm((await params).slug);
  return { title: product ? `Edit ${product.name}` : "Produk tidak ditemukan" };
}

export default async function AdminProductPage({ params, searchParams }: PageProps<"/admin/products/[slug]">) {
  const product = await getProductForm((await params).slug);
  if (!product) notFound();
  const saved = (await searchParams).saved;

  return (
    <>
      <AdminTopbar breadcrumb={`CMS / Shop / Products / ${product.name}`} title="Edit produk" />
      <div className={pageStyles.content}>
        <ProductEditor
          key={product.slug}
          initial={product}
          categories={productCategoryOptions()}
          imageOptions={siteImageOptions()}
          initialNotice={saved ? "Produk baru tersimpan." : undefined}
        />
      </div>
    </>
  );
}
