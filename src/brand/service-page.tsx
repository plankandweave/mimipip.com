import React, { createElement, type ComponentType } from 'react';
import { serviceAvailable } from './services';
import type { ServiceName } from './contract';
/** Keep the connected form intact, but do not invite a submission that cannot succeed. */
export function withServicePage<P extends object>(service: ServiceName, title: string, Template: ComponentType<P>): ComponentType<P> {
 return function ServicePage(props: P) {
  if (!serviceAvailable(service)) return <section role="status" style={{maxWidth:720,margin:'3rem auto',padding:'0 24px'}}>
   <h1>{title}</h1><p>This service is not available yet. No order, payment or message has been submitted.</p><a href="/collections">Back to collections</a>
  </section>;
  return createElement(Template,props);
 };
}
