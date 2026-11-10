import { expect, it } from "vitest";
import { projectReady } from "./nestedProjectReady";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
const group = { label:"1-2",reason:"nested archive",members:[{path:"one.zip",nestedArchive:true},{path:"reflection.pdf",nestedArchive:false,declaredBytes:20}] } as unknown as RecoverableGroup;
it("requires supported source and preserves supported companions",()=>{expect(projectReady(group,{"one.zip":[{path:"src/main.cpp",declaredBytes:3,disposition:"retain"}]})).toBe(true);expect(projectReady(group,{"one.zip":[{path:"notes.txt",declaredBytes:3,disposition:"retain"}]})).toBe(false)});
it("holds unclassified project files and unsupported companions",()=>{expect(projectReady(group,{"one.zip":[{path:"src/main.cpp",declaredBytes:3,disposition:"retain"},{path:"unknown.db",declaredBytes:3,disposition:"needs-review"}]})).toBe(false);const bad={...group,members:[...group.members,{path:"screenshot.gif",nestedArchive:false,declaredBytes:1}]} as RecoverableGroup;expect(projectReady(bad,{"one.zip":[{path:"src/main.cpp",declaredBytes:3,disposition:"retain"}]})).toBe(false)});
