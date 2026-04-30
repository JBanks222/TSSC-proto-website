(function () {
  'use strict';

  /**
  * Renders team cards from data/full-part-time.json and data/tech-fees.json.
   * All text is inserted with textContent to avoid HTML injection.
   */
  async function loadTeamMembers () {
    const facultyGrid = document.getElementById('facultyGrid');
    const techFeesGrid = document.getElementById('techFeesGrid');
    const status = document.getElementById('teamGridStatus');

    if (!facultyGrid || !techFeesGrid || !status) return;

    status.textContent = 'Loading team directory...';

    try {
      const [fullPartTimeResponse, techFeesResponse] = await Promise.all([
        fetch('data/full-part-time.json', { cache: 'no-store' }),
        fetch('data/tech-fees.json', { cache: 'no-store' })
      ]);

      if (!fullPartTimeResponse.ok || !techFeesResponse.ok) {
        throw new Error(
          'Failed to load team data (' + fullPartTimeResponse.status + ', ' + techFeesResponse.status + ')'
        );
      }

      const [fullPartTimeData, techFeesData] = await Promise.all([
        fullPartTimeResponse.json(),
        techFeesResponse.json()
      ]);
      const fullPartTimeEmployees = Array.isArray(fullPartTimeData.employees)
        ? fullPartTimeData.employees
        : [];
      const techFeeEmployees = Array.isArray(techFeesData.employees)
        ? techFeesData.employees
        : [];
      const sortedTechFeeEmployees = techFeeEmployees.slice().sort(function (a, b) {
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

      if (fullPartTimeEmployees.length === 0 && sortedTechFeeEmployees.length === 0) {
        status.textContent = 'No team members are listed yet.';
        return;
      }

      const facultyFragment = document.createDocumentFragment();
      const techFeesFragment = document.createDocumentFragment();

      function appendEmployeeCard (fragment, employee) {
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
        const headshot = (isCameraShy || !photoRaw) ? 'assets/headshots/placeholder.png' : photoRaw;
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
      }

      fullPartTimeEmployees.forEach(function (employee) {
        appendEmployeeCard(facultyFragment, employee);
      });

      sortedTechFeeEmployees.forEach(function (employee) {
        appendEmployeeCard(techFeesFragment, employee);
      });

      facultyGrid.innerHTML = '';
      facultyGrid.appendChild(facultyFragment);
      techFeesGrid.innerHTML = '';
      techFeesGrid.appendChild(techFeesFragment);

      const facultyCount = facultyGrid.children.length;
      const techFeeCount = techFeesGrid.children.length;
      const totalCount = facultyCount + techFeeCount;
      status.textContent = totalCount + ' team member' + (totalCount === 1 ? '' : 's') +
        ' loaded. Faculty: ' + facultyCount + '. Tech Fees: ' + techFeeCount + '.';
    } catch (error) {
      status.textContent = 'Unable to load team directory right now.';
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadTeamMembers);
})();
