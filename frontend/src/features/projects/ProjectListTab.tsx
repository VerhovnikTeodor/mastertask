import { useMemo } from 'react';
import { useWorkspace } from '../../layout/workspace';
import { Button } from '../../components/ui';
import { TaskListView } from '../tasks/TaskListView';
import { useProjectContext } from './ProjectLayout';

export default function ProjectListTab() {
  const { project, canEdit } = useProjectContext();
  const { openComposer } = useWorkspace();
  const fixed = useMemo(() => ({ projectId: [project.id] }), [project.id]);
  return (
    <div className="project-body">
      <TaskListView
        fixed={fixed}
        hideProject
        canEdit={canEdit}
        emptyAction={
          canEdit && (
            <Button variant="primary" icon="plus" onClick={() => openComposer({ projectId: project.id })}>
              Nova naloga
            </Button>
          )
        }
      />
    </div>
  );
}
