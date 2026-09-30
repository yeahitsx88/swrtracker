export function accountNavigation(projectId?: string) {
  const context = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return [
    { label: 'Home', href: projectId ? `/projects/${encodeURIComponent(projectId)}` : '/projects' },
    { label: 'Profile', href: `/profile${context}` },
    { label: 'Assignment Details', href: `/assignment-details${context}` },
    { label: 'Projects', href: '/projects' },
  ];
}
