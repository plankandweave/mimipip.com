
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { FlipBook } from "@/components/book/FlipBook";
import type { Project } from "@/content/projects/types";
import { getProject } from "@/content/projects";
import { notFound } from "next/navigation";
import "../book.css";
import "../flip.css";
import "./proposal.css";

export const metadata: Metadata = editorialMetadata("/projects/blue-tokai-k6gujret2jruq6lejrda5jmk");

  function BlueTokaiProposal() {
  const proposal = getProject("blue-tokai");
  if (!proposal) notFound();
  return <main><FlipBook project={proposal as Project} presentation={{
    label: "For Blue Tokai’s founders · Proposed designs",
    pdfHref: "/private/blue-tokai-k6gujret2jruq6lejrda5jmk/Blue-Tokai-Zyvorah-Private-Proposal.pdf",
  }} /></main>;
}

export default withBrandEditorial("/projects/blue-tokai-k6gujret2jruq6lejrda5jmk", BlueTokaiProposal);
