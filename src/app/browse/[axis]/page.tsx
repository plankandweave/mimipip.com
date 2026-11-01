import { notFound } from 'next/navigation';
import { Browse } from '@/brand/review/pages';
import { axes } from '@/brand/review/data';
export default async function Page({params,searchParams}:{params:Promise<{axis:string}>;searchParams:Promise<{value?:string}>}){const {axis}=await params;const match=axes.find(x=>x===axis);if(!match||process.env.MIMIPIP_LOCAL_REVIEW!=='1')notFound();return <Browse axis={match} value={(await searchParams).value??''}/>;}
