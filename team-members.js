(function () {
  'use strict';

  /**
   * Renders team cards from employees.json.
   * All text is inserted with textContent to avoid HTML injection.
   */
  async function loadTeamMembers () {
    const grid = document.getElementById('teamGrid');
    const status = document.getElementById('teamGridStatus');

    if (!grid || !status) return;

    status.textContent = 'Loading team directory...';

    try {
      const response = await fetch('employees.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load team data (' + response.status + ')');
      }

      const data = await response.json();
      const employees = Array.isArray(data.employees) ? data.employees : [];
      const sortedEmployees = employees.slice().sort(function (a, b) {
        const titleA = typeof a.Title === 'string' ? a.Title.trim().toLowerCase() : '';
        const titleB = typeof b.Title === 'string' ? b.Title.trim().toLowerCase() : '';
        const isManagerA = titleA.includes('manager');
        const isManagerB = titleB.includes('manager');
        const isPriorityA = titleA.includes('associate') || titleA.includes('support assistant');
        const isPriorityB = titleB.includes('associate') || titleB.includes('support assistant');

        var sortGroupA = isManagerA ? 0 : (isPriorityA ? 1 : 2);
        var sortGroupB = isManagerB ? 0 : (isPriorityB ? 1 : 2);

        if (sortGroupA !== sortGroupB) {
          return sortGroupA - sortGroupB;
        }

        const firstA = typeof a['First Name'] === 'string' ? a['First Name'].trim() : '';
        const lastA = typeof a['Last Name'] === 'string' ? a['Last Name'].trim() : '';
        const firstB = typeof b['First Name'] === 'string' ? b['First Name'].trim() : '';
        const lastB = typeof b['Last Name'] === 'string' ? b['Last Name'].trim() : '';

        const lastNameCompare = lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
        if (lastNameCompare !== 0) {
          return lastNameCompare;
        }

        return firstA.localeCompare(firstB, undefined, { sensitivity: 'base' });
      });

      if (sortedEmployees.length === 0) {
        status.textContent = 'No team members are listed yet.';
        return;
      }

      const fragment = document.createDocumentFragment();

      sortedEmployees.forEach(function (employee) {
        const firstName = typeof employee['First Name'] === 'string' ? employee['First Name'].trim() : '';
        const lastName = typeof employee['Last Name'] === 'string' ? employee['Last Name'].trim() : '';
        const name = (firstName + ' ' + lastName).trim() ||
          (typeof employee.name === 'string' ? employee.name.trim() : '');

        const title = typeof employee['Title'] === 'string' ? employee['Title'].trim() : '';
        const department = typeof employee['Department/Team'] === 'string'
          ? employee['Department/Team'].trim()
          : '';
        const yearStarted = typeof employee['Year Started'] === 'string'
          ? employee['Year Started'].trim()
          : '';
        const role = [title, department, yearStarted ? 'Since ' + yearStarted : '']
          .filter(Boolean)
          .join(' | ') ||
          (typeof employee.role === 'string' ? employee.role.trim() : '');

        const contributions = typeof employee['Role & Contributions'] === 'string'
          ? employee['Role & Contributions'].trim()
          : '';
        const funFact = typeof employee['Fun Fact or Interests'] === 'string'
          ? employee['Fun Fact or Interests'].trim()
          : '';
        const bio = contributions || (typeof employee.bio === 'string' ? employee.bio.trim() : '');

        const photoRaw = typeof employee['Photo'] === 'string'
          ? employee['Photo'].trim()
          : (typeof employee.headshot === 'string' ? employee.headshot.trim() : '');
        const isCameraShy = photoRaw.toLowerCase() === 'camera shy';
        const headshot = (isCameraShy || !photoRaw) ? 'headshots/placeholder.png' : photoRaw;
        const email = typeof employee.Email === 'string'
          ? employee.Email.trim()
          : (typeof employee.email === 'string' ? employee.email.trim() : '');

        if (!name || !role || !bio) {
          return;
        }

        const li = document.createElement('li');

        const article = document.createElement('article');
        article.className = 'team-card';
        article.tabIndex = 0;

        const photoWrap = document.createElement('div');
        photoWrap.className = 'team-card__photo-wrap';

        const img = document.createElement('img');
        img.className = 'team-card__photo';
        img.src = headshot;
        img.alt = isCameraShy ? 'Camera shy placeholder for ' + name : 'Portrait of ' + name;
        img.width = 120;
        img.height = 120;
        img.loading = 'lazy';
        img.decoding = 'async';
        photoWrap.appendChild(img);

        const body = document.createElement('div');
        body.className = 'team-card__body';

        const nameEl = document.createElement('h3');
        nameEl.className = 'team-card__name mask-text';
        nameEl.textContent = name;

        const roleEl = document.createElement('p');
        roleEl.className = 'team-card__role';
        roleEl.textContent = role;

        const bioEl = document.createElement('p');
        bioEl.className = 'team-card__bio';
        bioEl.textContent = bio;

        body.appendChild(nameEl);
        body.appendChild(roleEl);
        body.appendChild(bioEl);

        if (funFact) {
          const funSection = document.createElement('section');
          funSection.className = 'team-card__fun';

          const funTitle = document.createElement('h4');
          funTitle.className = 'team-card__fun-title';
          funTitle.textContent = 'Fun Fact or Interests';

          const funText = document.createElement('p');
          funText.className = 'team-card__fun-text';
          funText.textContent = funFact;

          funSection.appendChild(funTitle);
          funSection.appendChild(funText);
          body.appendChild(funSection);
        }

        if (email) {
          const emailEl = document.createElement('a');
          emailEl.className = 'team-card__email';
          emailEl.href = 'mailto:' + email;
          emailEl.setAttribute('aria-label', 'Email ' + name);
          emailEl.textContent = email;
          body.appendChild(emailEl);
        }

        article.appendChild(photoWrap);
        article.appendChild(body);
        li.appendChild(article);
        fragment.appendChild(li);
      });

      grid.innerHTML = '';
      grid.appendChild(fragment);

      const count = grid.children.length;
      status.textContent = count + ' team member' + (count === 1 ? '' : 's') + ' loaded.';
    } catch (error) {
      status.textContent = 'Unable to load team directory right now.';
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadTeamMembers);
})();
