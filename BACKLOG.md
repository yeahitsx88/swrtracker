Execution Order                                                                                                                                    
                                                                                                                                                     
  1. WS1-T1 Add AOR assignment repository contracts and application services for user-scoped and department-scoped aor_assignments, including deacti 
     vation/reassignment semantics. Dependencies: none. File targets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/t 
     enancy.repository.ts, new src/modules/tenancy/application/assign-aor-user.ts, new src/modules/tenancy/application/assign-aor-department.ts, new 
     tests/tenancy/aor-assignments.test.ts. Citations: CLAUDE.md#L290 CLAUDE.md#L296 CLAUDE.md#L298 CLAUDE.md#L1268                                  
  2. WS1-T2 Add the project setup API surface for AOR assignments and deactivations, authorized for PROJECT_ADMIN and TENANT_ADMIN during setup. Dep 
     endencies: WS1-T1. File targets: new src/app/api/projects/[projectId]/aor/assignments/route.ts, src/app/api/projects/[projectId]/aor/route.ts,  
     new tests/tenancy/aor-assignment-route.test.ts. Citations: CLAUDE.md#L84 CLAUDE.md#L1268 CLAUDE.md#L1280                                        
  3. WS2-T1 Add department repository/application support to create and list departments, and auto-seed the canonical manager title into department_ 
     titles on creation. Dependencies: WS1-T1. File targets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/tenancy.re 
     pository.ts, new src/modules/tenancy/application/create-department.ts, new src/modules/tenancy/application/list-departments.ts, new tests/tenan 
     cy/departments.test.ts. Citations: CLAUDE.md#L116 CLAUDE.md#L118 CLAUDE.md#L302 CLAUDE.md#L307 CLAUDE.md#L313 CLAUDE.md#L1269                   
  4. WS2-T2 Add the department API surface for create/list operations under project setup. Dependencies: WS2-T1. File targets: new src/app/api/proje 
     cts/[projectId]/departments/route.ts, src/modules/tenancy/application/index.ts, new tests/tenancy/department-route.test.ts. Citations:          
     CLAUDE.md#L84 CLAUDE.md#L1269                                                                                                                   
  5. WS2-T3 Add title-catalog management for departments, including default_priority and assignment_layer validation. Dependencies: WS2-T1. File tar 
     gets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/tenancy.repository.ts, new src/modules/tenancy/application/u 
     psert-department-title.ts, new src/modules/tenancy/application/list-department-titles.ts, new src/app/api/projects/[projectId]/departments/[dep 
     artmentId]/titles/route.ts, new tests/tenancy/department-titles.test.ts. Citations: CLAUDE.md#L118 CLAUDE.md#L145 CLAUDE.md#L150 CLAUDE.md#L329 
     CLAUDE.md#L337 CLAUDE.md#L1270                                                                                                                  
  6. WS2-T4 Add department membership entry, one-department-per-user enforcement, free-agent pool handling, and title assignment workflows including 
     superintendent_id. Dependencies: WS2-T1, WS2-T3, WS1-T1. File targets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastruc 
     ture/tenancy.repository.ts, new src/modules/tenancy/application/add-department-member.ts, new src/modules/tenancy/application/assign-department-     title.ts, new src/modules/tenancy/application/reassign-department-member.ts, new src/app/api/projects/[projectId]/departments/[departmentId]/me 
     mbers/route.ts, new tests/tenancy/department-memberships.test.ts. Citations: CLAUDE.md#L121 CLAUDE.md#L122 CLAUDE.md#L123 CLAUDE.md#L125        
     CLAUDE.md#L315 CLAUDE.md#L326 CLAUDE.md#L327 CLAUDE.md#L1272                                                                                    
  7. WS3-T1 Wire ticket submission to derive department_id and default priority from department_memberships and department_titles, with manual depar 
     tment fallback when the requester has no membership. Dependencies: WS2-T3, WS2-T4. File targets: src/modules/ticket/application/create-ticket.t 
     s, src/modules/ticket/application/submit-ticket.ts, src/modules/ticket/application/ports.ts, src/modules/ticket/infrastructure/ticket.repositor 
     y.ts, src/app/api/tickets/route.ts, new tests/ticket/submission-priority.test.ts. Citations: CLAUDE.md#L125 CLAUDE.md#L127 CLAUDE.md#L145       
     CLAUDE.md#L150 CLAUDE.md#L402 CLAUDE.md#L403                                                                                                    
  8. WS3-T2 Implement DEPARTMENT_MANAGER and DEPARTMENT_LEAD visibility resolution, including department-only scope for managers and department-plus-     AOR intersection for leads. Dependencies: WS1-T1, WS2-T4, WS3-T1. File targets: src/lib/resolve-visibility.ts, src/modules/ticket/application/p 
     orts.ts, src/modules/ticket/infrastructure/ticket.repository.ts, tests/ticket/visibility-repository.test.ts. Citations: CLAUDE.md#L129          
     CLAUDE.md#L673 CLAUDE.md#L674 CLAUDE.md#L723 CLAUDE.md#L724                                                                                     
  9. WS4-T1 Add the direct-assignment creation use case so Variant 2 enters at ASSIGNED, stores immediate crew assignment context, and does not reuse     requester draft semantics. Dependencies: WS3-T1. File targets: new src/modules/ticket/application/create-direct-assignment-ticket.ts, src/modul 
     es/ticket/application/index.ts, src/modules/ticket/application/ports.ts, src/app/api/tickets/route.ts, new tests/ticket/direct-assignment.test. 
     ts. Citations: CLAUDE.md#L568 CLAUDE.md#L574 CLAUDE.md#L591 CLAUDE.md#L592 PROJECT_VISION_v2.md#L138 PROJECT_VISION_v2.md#L157                  
  10. WS4-T2 Align Variant 2 authorization and transition handling across assignment, start, PC approval, delay, and cancellation paths so direct-as 
     signment tickets work end-to-end through the existing API set. Dependencies: WS4-T1. File targets: src/modules/ticket/application/assign-ticket 
     .ts, src/modules/ticket/application/start-ticket.ts, src/modules/ticket/application/approve-pc-status.ts, src/modules/ticket/application/reject-     pc-status.ts, src/modules/ticket/application/request-field-cancel.ts, src/modules/workflow/domain/transitions.ts, tests/workflow/transitions.te 
     st.ts, new tests/ticket/direct-assignment-route-smoke.test.ts. Citations: CLAUDE.md#L574 CLAUDE.md#L591 PROJECT_VISION_v2.md#L387               
  11. WS5-T1 Add project lifecycle activation logic with the build-aware SETUP -> ACTIVE readiness gate and warnings acknowledgement flow. Dependenc 
     ies: WS1-T2, WS2-T2, WS2-T4. File targets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/tenancy.repository.ts,  
     new src/modules/tenancy/application/activate-project.ts, new src/app/api/projects/[projectId]/activate/route.ts, new tests/tenancy/project-acti 
  12. WS5-T2 Add ACTIVE -> ARCHIVED transition handling and repository guards for archived project immutability. Dependencies: WS5-T1. File targets: 
     src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/tenancy.repository.ts, new src/modules/tenancy/application/archive-
     project.ts, new src/app/api/projects/[projectId]/archive/route.ts, tests/tenancy/project-activation.test.ts. Citations: CLAUDE.md#L1240
     CLAUDE.md#L1242
  13. WS5-T3 Enforce lifecycle gates across ticket and setup APIs: no ticket submission in SETUP, no mutations in ARCHIVED, and no project-setup mut
     ation after activation unless explicitly allowed. Dependencies: WS5-T1, WS5-T2. File targets: src/app/api/tickets/route.ts, src/modules/ticket/
     application/create-ticket.ts, src/modules/ticket/application/submit-ticket.ts, src/app/api/projects/[projectId]/aor/route.ts, new department and
     AOR assignment routes from earlier tasks, new tests/ticket/project-lifecycle-guards.test.ts. Citations: CLAUDE.md#L1238 CLAUDE.md#L1240
     CLAUDE.md#L1280
  14. WS6-T1 Add the tenant-admin template read/list surface with summary fields and usage counts required by the template-management surface. Depen
     dencies: none. File targets: src/modules/tenancy/application/ports.ts, src/modules/tenancy/infrastructure/tenancy.repository.ts, new src/module
     s/tenancy/application/list-project-templates.ts, src/app/api/project-templates/route.ts, new tests/tenancy/project-template-list.test.ts, possi
     ble follow-up migration 014_project_templates_updated_at.sql if updated_at is needed to satisfy the read surface. Citations: CLAUDE.md#L365
     CLAUDE.md#L1394 CLAUDE.md#L1396 CLAUDE.md#L659
  15. WS6-T2 Retire legacy areas / subareas write surfaces and their application helpers after AOR node and assignment APIs are fully in place, and
     move smoke fixtures off legacy cleanup assumptions. Dependencies: WS1-T2, WS6-T1. File targets: src/app/api/projects/[projectId]/areas/route.ts,
     src/app/api/projects/[projectId]/areas/[areaId]/subareas/route.ts, src/modules/tenancy/application/create-area.ts, src/modules/tenancy/applicat
     ion/create-subarea.ts, src/modules/tenancy/infrastructure/tenancy.repository.ts, tests/ticket/ticket-route-smoke.ts. Citations: CLAUDE.md#L1118
     PROJECT_VISION_v2.md#L204 PROJECT_VISION_v2.md#L213
  16. WS7-T1 Implement attachment metadata/API support for requester uploads on active tickets, with active-status permission checks, object metadata
     validation hooks, and audit emission. Dependencies: WS5-T3. File targets: src/modules/attachment/domain/types.ts, src/modules/attachment/applic
     ation/index.ts, src/modules/attachment/infrastructure/index.ts, new src/app/api/tickets/[ticketId]/attachments/route.ts, src/modules/audit/doma
     in/types.ts, new tests/attachment/attachment-permissions.test.ts. Citations: CLAUDE.md#L437 PROJECT_VISION_v2.md#L191 PROJECT_VISION_v2.md#L198
     PROJECT_VISION_v2.md#L200 PROJECT_VISION_v2.md#L349
  17. WS8-T1 Implement the notification foundation needed for spec-defined Phase 2 operational signals: approver timeout notices and tenant/project-
     admin daily vacancy notifications. Dependencies: WS5-T1. File targets: src/modules/notification/application/index.ts, src/modules/notification/
     infrastructure/index.ts, relevant ticket/tenancy use cases once event emission points are identified, new tests/notification/timeout-and-vacanc
     y.test.ts. Citations: CLAUDE.md#L26 CLAUDE.md#L1420 CLAUDE.md#L1448 CLAUDE.md#L1450 PROJECT_VISION_v2.md#L358
  18. WS9-T1 Expand verification coverage to the Phase 2 closure set and append milestone logs only after each prior task batch is green. Dependenci
     es: WS1-T1 through WS8-T1. File targets: tests/tenancy, tests/ticket, tests/workflow, tests/attachment, tests/notification, PHASE2_STATUS.md, C
     ODEX.md. Citations: CLAUDE.md#L1118 PROJECT_VISION_v2.md#L387

  Excluded from this Phase 2 execution order: reporting and audit surfaces beyond workflow-required event emission, because those remain Phase 4 by
  spec. Citations: CLAUDE.md#L1115 PROJECT_VISION_v2.md#L389